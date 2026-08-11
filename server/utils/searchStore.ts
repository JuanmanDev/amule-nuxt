/**
 * Searches, kept for a week and shared by every browser.
 *
 * aMule holds exactly one search: starting another throws the previous results
 * away, and nothing survives a restart of the daemon. Results are expensive -
 * a Kad query takes the better part of a minute to settle - so they are worth
 * keeping, and keeping *here* rather than in the browser:
 *
 *  * a page reload keeps them, which `useState` alone does not;
 *  * the phone sees the searches started on the desktop, because the store is
 *    the server both of them talk to.
 *
 * Bounded three ways, because this is a JSON file and not a database: a week of
 * retention, a cap on how many searches are kept, and a cap on how many results
 * each one keeps. All three are visible in the values below rather than being
 * silently applied somewhere in the middle of a write.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { useLogger } from './logger';
import type { SearchResult, SearchType } from './amule-types';

const log = useLogger('searches');

export interface StoredSearch {
    id: string;
    keyword: string;
    type: SearchType;
    /** Epoch ms it was started, or last re-run. */
    startedAt: number;
    /** Epoch ms its results were last read. Retention counts from here. */
    updatedAt: number;
    status: 'running' | 'done' | 'stopped' | 'failed';
    results: SearchResult[];
    error?: string;
}

/** How long a search is kept after it was last touched. */
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Oldest searches beyond this are dropped, so the file cannot grow forever. */
const MAX_SEARCHES = 20;

/**
 * Results kept per search. A broad Kad query returns several hundred; keeping
 * every one of twenty such searches would be tens of megabytes of JSON re-read
 * on every request. The list is stored in the order the daemon reported it, so
 * the cap drops the tail rather than anything the user has sorted to the top.
 */
const MAX_RESULTS_PER_SEARCH = 500;

let searches: StoredSearch[] | null = null;
let loading: Promise<StoredSearch[]> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_DELAY_MS = 2000;

function storePath(): string {
    const base = process.env.AMULE_DATA_DIR || resolve(process.cwd(), '.amule-data');
    return resolve(base, 'searches.json');
}

/** Drops what has expired and what does not fit, newest kept first. */
export function prune(all: StoredSearch[], now: number): StoredSearch[] {
    return all
        .filter(search => now - search.updatedAt < RETENTION_MS)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_SEARCHES);
}

function trim(search: StoredSearch): StoredSearch {
    return search.results.length <= MAX_RESULTS_PER_SEARCH
        ? search
        : { ...search, results: search.results.slice(0, MAX_RESULTS_PER_SEARCH) };
}

async function load(): Promise<StoredSearch[]> {
    try {
        const parsed = JSON.parse(await readFile(storePath(), 'utf8'));
        return Array.isArray(parsed) ? prune(parsed, Date.now()) : [];
    } catch {
        // No file yet, or an unreadable one: losing old searches is not worth
        // failing the page over
        return [];
    }
}

async function ready(): Promise<StoredSearch[]> {
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
        log.warn('Could not write the stored searches', e);
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

/** Everything still within the retention window, newest first. */
export async function listSearches(): Promise<StoredSearch[]> {
    const all = await ready();
    const kept = prune(all, Date.now());

    if (kept.length !== all.length) {
        searches = kept;
        scheduleFlush();
    }

    return kept;
}

/** Adds a search or replaces the stored copy of one. */
export async function saveSearch(search: StoredSearch): Promise<StoredSearch[]> {
    const all = await ready();

    searches = prune(
        [trim(search), ...all.filter(entry => entry.id !== search.id)],
        Date.now()
    );
    scheduleFlush();

    return searches;
}

export async function removeSearch(id: string): Promise<boolean> {
    const all = await ready();
    const kept = all.filter(entry => entry.id !== id);

    if (kept.length === all.length) return false;

    searches = kept;
    scheduleFlush();
    return true;
}

/** Only used by the tests. */
export function resetSearchStore(): void {
    searches = null;
    loading = null;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
}
