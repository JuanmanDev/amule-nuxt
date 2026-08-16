/**
 * Automatic searches: the same keywords run over and over by the server itself.
 *
 * A normal search only sees the servers and Kad nodes that answer *right now*.
 * Files sit on machines that come and go, so a search repeated every few
 * minutes over hours or days keeps finding sources a single pass never could.
 * The server runs these on its own schedule — no browser needs to stay open —
 * and every pass merges into one result list, deduplicated by file hash.
 *
 * Stored as a JSON file next to the manual searches, bounded the same way:
 * a cap on how many automatic searches exist and on how many results each one
 * accumulates, both visible below rather than applied silently mid-write.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { useLogger } from './logger';
import type { SearchResult, SearchType } from './amule-types';

const log = useLogger('auto-search');

export type AutoSearchDuration = '1h' | '1d' | '1w' | '1m' | 'forever';

export type AutoSearchStatus = 'active' | 'stopped' | 'finished';

export interface AutoSearch {
    id: string;
    keyword: string;
    /** Networks cycled run by run, so every pass asks a different audience. */
    networks: SearchType[];
    /** Time between two passes. */
    intervalMs: number;
    duration: AutoSearchDuration;
    /** Epoch ms it was created, or last resumed. */
    createdAt: number;
    /** Epoch ms it stops on its own, or null for "until stopped". */
    endsAt: number | null;
    /** Epoch ms of the last completed pass, 0 before the first. */
    lastRunAt: number;
    /** Epoch ms the next pass is due. */
    nextRunAt: number;
    /** Completed passes. Also picks which network the next pass uses. */
    runs: number;
    /** Results the last pass added that no earlier pass had seen. */
    newLastRun: number;
    status: AutoSearchStatus;
    /** Accumulated results, oldest finding first, deduplicated by hash. */
    results: SearchResult[];
    /** The last pass's failure, cleared by the next pass that works. */
    lastError?: string;
}

export const DURATIONS: Record<AutoSearchDuration, number | null> = {
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1m': 30 * 24 * 60 * 60 * 1000,
    forever: null
};

/** Default pause between passes; the UI presents this as "every 5 minutes". */
export const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/** The interval is clamped here: below strains the daemon, above is pointless. */
export const MIN_INTERVAL_MS = 60 * 1000;
export const MAX_INTERVAL_MS = 60 * 60 * 1000;

/** Automatic searches allowed at once, active and stopped together. */
export const MAX_AUTO_SEARCHES = 10;

/**
 * Results kept per automatic search. Higher than a manual search's cap because
 * accumulating is the whole point, but still bounded: this file is re-read and
 * re-written whole.
 */
export const MAX_RESULTS_PER_SEARCH = 3000;

let searches: AutoSearch[] | null = null;
let loading: Promise<AutoSearch[]> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_DELAY_MS = 2000;

function storePath(): string {
    const base = process.env.AMULE_DATA_DIR || resolve(process.cwd(), '.amule-data');
    return resolve(base, 'auto-searches.json');
}

async function load(): Promise<AutoSearch[]> {
    try {
        const parsed = JSON.parse(await readFile(storePath(), 'utf8'));
        if (!Array.isArray(parsed)) return [];

        // A search that was mid-pass when the server died must not stay "due
        // five minutes ago" forever; it becomes due now and the runner takes it
        // from there.
        return parsed.map((entry: AutoSearch) => ({ ...entry, nextRunAt: Math.max(entry.nextRunAt, 0) }));
    } catch {
        return [];
    }
}

async function ready(): Promise<AutoSearch[]> {
    if (searches) return searches;
    loading ??= load().then(loaded => (searches = loaded));
    return loading;
}

async function flush(): Promise<void> {
    if (!searches) return;

    const path = storePath();
    try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(searches), 'utf8');
    } catch (e) {
        log.warn('Could not write the automatic searches', e);
    }
}

function scheduleFlush(): void {
    if (flushTimer) return;

    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
    }, FLUSH_DELAY_MS);
    flushTimer.unref?.();
}

export async function listAutoSearches(): Promise<AutoSearch[]> {
    return ready();
}

export async function getAutoSearch(id: string): Promise<AutoSearch | null> {
    const all = await ready();
    return all.find(entry => entry.id === id) ?? null;
}

export async function createAutoSearch(input: {
    keyword: string;
    networks: SearchType[];
    duration: AutoSearchDuration;
    intervalMs?: number;
}): Promise<AutoSearch> {
    const all = await ready();

    if (all.length >= MAX_AUTO_SEARCHES) {
        throw new Error(`At most ${MAX_AUTO_SEARCHES} automatic searches can exist at once; delete one first`);
    }

    const now = Date.now();
    const span = DURATIONS[input.duration];
    const intervalMs = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, input.intervalMs ?? DEFAULT_INTERVAL_MS));

    const search: AutoSearch = {
        id: `auto-${now.toString(36)}-${Math.floor(Math.random() * 36 ** 4).toString(36)}`,
        keyword: input.keyword,
        networks: input.networks,
        intervalMs,
        duration: input.duration,
        createdAt: now,
        endsAt: span === null ? null : now + span,
        lastRunAt: 0,
        // Due immediately: the person who just created it wants first results
        // now, not in five minutes.
        nextRunAt: now,
        runs: 0,
        newLastRun: 0,
        status: 'active',
        results: []
    };

    searches = [search, ...all];
    scheduleFlush();
    return search;
}

export async function patchAutoSearch(id: string, changes: Partial<AutoSearch>): Promise<AutoSearch | null> {
    const all = await ready();
    const index = all.findIndex(entry => entry.id === id);
    if (index === -1) return null;

    const updated = { ...all[index]!, ...changes };
    searches = [...all.slice(0, index), updated, ...all.slice(index + 1)];
    scheduleFlush();
    return updated;
}

export async function removeAutoSearch(id: string): Promise<boolean> {
    const all = await ready();
    const kept = all.filter(entry => entry.id !== id);
    if (kept.length === all.length) return false;

    searches = kept;
    scheduleFlush();
    return true;
}

/**
 * Folds one pass's results into what earlier passes accumulated.
 *
 * Keyed by hash (or the eD2k link when the daemon reported none), so a file
 * seen on every pass appears once. A file seen again keeps its place in the
 * list but takes the fresh copy, because its source count is the one figure
 * that changes and the one worth being current. Answers with how many results
 * were genuinely new.
 */
export function mergeResults(search: AutoSearch, fresh: SearchResult[]): number {
    const keyOf = (result: SearchResult) => result.hash || result.ed2kLink || `#${result.resultNumber}`;

    const byKey = new Map(search.results.map(result => [keyOf(result), result]));
    const before = byKey.size;

    for (const result of fresh) {
        byKey.set(keyOf(result), result);
    }

    let merged = [...byKey.values()];
    // The cap drops the oldest findings: the newest are the ones whose sources
    // are still fresh enough to download from.
    if (merged.length > MAX_RESULTS_PER_SEARCH) {
        merged = merged.slice(merged.length - MAX_RESULTS_PER_SEARCH);
    }

    search.results = merged;
    return byKey.size - before;
}

/** Only used by the tests. */
export function resetAutoSearchStore(): void {
    searches = null;
    loading = null;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
}
