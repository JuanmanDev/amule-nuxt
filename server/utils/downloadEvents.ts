/**
 * Turns two readings of the download queue into the things worth telling someone
 * about: a download that appeared, and one that finished.
 *
 * Pure on purpose - it takes a snapshot and returns events - because the
 * interesting part is the edge cases, and they are far easier to pin down in a
 * test than against a live daemon:
 *
 *  * aMule drops a finished file from the queue and moves it to the incoming
 *    folder, so "completed" usually arrives as a *disappearance*, not as a status
 *    change. A download that vanishes at 99.8% finished; one that vanishes at 3%
 *    was cancelled, and saying "completed" there would be a lie.
 *  * The first reading after a restart is not news. Without seeding, every
 *    download already in the queue would be announced as new.
 */

export type DownloadEventKind = 'added' | 'completed';

export interface DownloadEvent {
    kind: DownloadEventKind;
    hash: string;
    name: string;
    size: number;
    /** Epoch ms the event was detected. */
    at: number;
}

/** What has to be remembered between two readings. */
export interface QueueEntry {
    hash: string;
    name: string;
    size: number;
    percentComplete: number;
    status: string;
}

export type QueueSnapshot = Map<string, QueueEntry>;

/**
 * How complete a download must have been, when it left the queue, for its
 * disappearance to count as finishing.
 *
 * Not 100: the last reading before aMule moves the file can be a fraction short,
 * and a cancelled download is nowhere near this.
 */
const COMPLETE_ENOUGH_PERCENT = 99;

export function toSnapshot(downloads: readonly QueueEntry[]): QueueSnapshot {
    return new Map(downloads.map(download => [download.hash, download]));
}

function isComplete(entry: QueueEntry): boolean {
    return entry.status === 'Complete' || entry.percentComplete >= 100;
}

/**
 * Compares two snapshots.
 *
 * `previous` being null means "nothing is known yet": the queue is adopted
 * silently and no events come out of it.
 */
export function diffQueue(
    previous: QueueSnapshot | null,
    current: QueueSnapshot,
    now: number
): DownloadEvent[] {
    if (!previous) return [];

    const events: DownloadEvent[] = [];

    for (const [hash, entry] of current) {
        const before = previous.get(hash);

        if (!before) {
            // A download that is already complete the first time it is seen was
            // not added by anyone watching - it is aMule rehashing or re-adding a
            // finished file, and announcing it as new is noise.
            events.push(
                isComplete(entry)
                    ? { kind: 'completed', hash, name: entry.name, size: entry.size, at: now }
                    : { kind: 'added', hash, name: entry.name, size: entry.size, at: now }
            );
            continue;
        }

        if (isComplete(entry) && !isComplete(before)) {
            events.push({ kind: 'completed', hash, name: entry.name, size: entry.size, at: now });
        }
    }

    for (const [hash, before] of previous) {
        if (current.has(hash)) continue;

        // Gone from the queue. Finished files leave it; so do cancelled ones, and
        // only how far along they were tells the two apart.
        if (before.percentComplete >= COMPLETE_ENOUGH_PERCENT && !isComplete(before)) {
            events.push({ kind: 'completed', hash, name: before.name, size: before.size, at: now });
        }
    }

    return events;
}
