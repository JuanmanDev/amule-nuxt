/**
 * When each download started and when it finished.
 *
 * aMule's External Connection does not report either. A partfile carries "last
 * data received" and "last seen complete" - both about *sources*, not about the
 * download - and nothing that says when it was added or when it was done. So the
 * two timestamps are recorded here, from the only place that can know them: the
 * queue watcher, which already compares each reading with the previous one to
 * decide what to notify about.
 *
 * What that means for accuracy, and why the UI is careful about it:
 *
 *  * A download this app watched being added has a real `addedAt`.
 *  * A download that was already in the queue the first time this app looked has
 *    only `firstSeenAt`, and is flagged `seeded`. It started at *some* point
 *    before that, and saying otherwise would be inventing data.
 *  * `completedAt` is the moment the file reached 100% or left the queue as good
 *    as finished - the same event the notifications use.
 *
 * Kept in one small JSON file so the timestamps survive a restart of the app,
 * which is the entire point: the daemon runs for weeks.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { useLogger } from './logger';
import type { QueueEntry } from './downloadEvents';

const log = useLogger('history');

export interface DownloadHistoryEntry {
    /** File name when it was last seen, so a finished download can still be named. */
    name: string;
    size: number;
    /** Epoch ms this app first saw the hash at all. */
    firstSeenAt: number;
    /**
     * Epoch ms it joined the queue, when that was actually observed. Absent for
     * entries that were already there when this app started watching.
     */
    addedAt?: number;
    /** Epoch ms it finished, when that was observed. */
    completedAt?: number;
    /** True when the entry was adopted from a queue that already existed. */
    seeded?: boolean;
}

/**
 * Entries are kept after the file leaves the queue, so a finished download can
 * still say when it finished - that is what the shared-files page reads. Bounded
 * so a long-lived daemon does not grow the file without limit; the oldest
 * *finished* entries go first.
 */
const MAX_ENTRIES = 2000;

/** Writes are batched: the watcher touches this every couple of seconds. */
const FLUSH_DELAY_MS = 5000;

type History = Record<string, DownloadHistoryEntry>;

let history: History | null = null;
let loading: Promise<History> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

function historyPath(): string {
    const base = process.env.AMULE_DATA_DIR || resolve(process.cwd(), '.amule-data');
    return resolve(base, 'history.json');
}

async function load(): Promise<History> {
    try {
        const parsed = JSON.parse(await readFile(historyPath(), 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed as History : {};
    } catch {
        // No file yet, or an unreadable one. Losing the timestamps is not worth
        // refusing to serve the queue over.
        return {};
    }
}

async function ready(): Promise<History> {
    if (history) return history;
    loading ??= load().then(loaded => (history = loaded));
    return loading;
}

async function flush(): Promise<void> {
    if (!history || !dirty) return;

    dirty = false;
    const path = historyPath();

    try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(history), 'utf8');
    } catch (e) {
        log.warn('Could not write the download history', e);
    }
}

function scheduleFlush(): void {
    dirty = true;
    if (flushTimer) return;

    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
    }, FLUSH_DELAY_MS);
    flushTimer.unref?.();
}

/** Drops the oldest finished entries once the file would grow past its bound. */
function prune(current: History, liveHashes: Set<string>): void {
    const hashes = Object.keys(current);
    if (hashes.length <= MAX_ENTRIES) return;

    const removable = hashes
        .filter(hash => !liveHashes.has(hash))
        .sort((a, b) => (current[a]!.completedAt ?? current[a]!.firstSeenAt)
            - (current[b]!.completedAt ?? current[b]!.firstSeenAt));

    for (const hash of removable.slice(0, hashes.length - MAX_ENTRIES)) {
        delete current[hash];
    }
}

/**
 * Folds one reading of the queue into the history.
 *
 * `seeding` is true for the very first reading after the app starts: everything
 * in it was added before this app was watching, so it gets `firstSeenAt` and the
 * `seeded` flag rather than a start time it cannot vouch for.
 */
export async function recordQueue(entries: readonly QueueEntry[], seeding: boolean): Promise<void> {
    const current = await ready();
    const now = Date.now();

    for (const entry of entries) {
        const existing = current[entry.hash];

        if (!existing) {
            current[entry.hash] = {
                name: entry.name,
                size: entry.size,
                firstSeenAt: now,
                ...(seeding ? { seeded: true } : { addedAt: now })
            };
            scheduleFlush();
            continue;
        }

        // aMule renames a partfile once it learns the real name from a source
        if (entry.name && entry.name !== existing.name) {
            existing.name = entry.name;
            scheduleFlush();
        }
        if (entry.size && entry.size !== existing.size) {
            existing.size = entry.size;
            scheduleFlush();
        }
    }

    prune(current, new Set(entries.map(entry => entry.hash)));
}

/** Marks a download as finished. Ignored if it was already marked. */
export async function recordCompleted(hash: string, name: string, size: number, at: number): Promise<void> {
    const current = await ready();
    const existing = current[hash];

    if (existing?.completedAt) return;

    current[hash] = {
        name: existing?.name || name,
        size: existing?.size || size,
        firstSeenAt: existing?.firstSeenAt ?? at,
        addedAt: existing?.addedAt,
        seeded: existing?.seeded,
        completedAt: at
    };

    scheduleFlush();
    // Finishing is worth writing straight away: it is the one timestamp that
    // would otherwise be lost if the process stopped within the batch window.
    await flush();
}

/** What is known about one hash, or undefined. */
export async function historyFor(hash: string): Promise<DownloadHistoryEntry | undefined> {
    return (await ready())[hash.toLowerCase()];
}

/** The whole history, for annotating a list in one go. */
export async function historySnapshot(): Promise<History> {
    return ready();
}

/**
 * Adds the recorded timestamps to anything carrying a `hash`.
 *
 * Used for both the download queue and the shared files, so a finished file
 * still reports when it finished after aMule has moved it out of the queue.
 */
export async function withHistory<T extends { hash: string }>(items: readonly T[]): Promise<Array<T & {
    addedAt?: number;
    completedAt?: number;
    firstSeenAt?: number;
    startKnown?: boolean;
}>> {
    const current = await ready();

    return items.map(item => {
        const entry = current[(item.hash || '').toLowerCase()];
        if (!entry) return item;

        return {
            ...item,
            addedAt: entry.addedAt,
            completedAt: entry.completedAt,
            firstSeenAt: entry.firstSeenAt,
            // False for a download that predates this app watching: the UI says
            // "seen since" instead of claiming it started then
            startKnown: Boolean(entry.addedAt)
        };
    });
}
