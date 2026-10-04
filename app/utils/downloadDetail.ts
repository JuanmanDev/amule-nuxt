import type { Download, SharedFile } from '../../server/utils/amule-types';

/**
 * Fields only the detail endpoint carries (amuleapi's GET /downloads/{hash}).
 * The queue list never has them, so they are taken from the detail response.
 */
const DETAIL_ONLY = [
    'parts',
    'totalParts',
    'remainingSeconds',
    'activeSeconds',
    'directory',
    'partFileName',
    'aichHash',
    'lostToCorruptionBytes',
    'gainedByCompressionBytes',
    'ichRecoveredPackets',
    'uploadQueueCount',
    'media'
] as const satisfies ReadonlyArray<keyof Download>;

/**
 * The open download as the details view shows it: the live queue entry - which
 * the push refreshes every couple of seconds - plus what only the detail
 * endpoint knows.
 *
 * amuleapi's list leaves the "last received", "last seen complete" and
 * "available parts" figures unknown (0, as EC spells unknown) while its detail
 * view has them, so for those the non-zero reading wins. Over EC both readings
 * come from the same queue entry and agree.
 */
export function mergeDownloadDetail(live: Download | null | undefined, detail: Download | null | undefined): Download | null {
    if (!live) return null;
    if (!detail || detail.hash !== live.hash) return live;

    const merged: Download = { ...live };
    for (const key of DETAIL_ONLY) {
        if (detail[key] !== undefined) (merged as any)[key] = detail[key];
    }

    merged.lastReceived = live.lastReceived || detail.lastReceived;
    merged.lastSeenComplete = live.lastSeenComplete || detail.lastSeenComplete;
    merged.availableParts = live.availableParts || detail.availableParts;

    return merged;
}

/**
 * Seconds left, preferring the daemon's own estimate (amuleapi) and falling
 * back to remaining bytes over the current speed. Null when there is nothing
 * to estimate from - stalled, paused, or done.
 */
export function remainingSeconds(download: Pick<Download, 'size' | 'sizeDone' | 'speed' | 'remainingSeconds'>): number | null {
    if (typeof download.remainingSeconds === 'number' && download.remainingSeconds >= 0) {
        return download.remainingSeconds;
    }
    const left = Math.max(0, (download.size || 0) - (download.sizeDone || 0));
    const bytesPerSecond = (download.speed || 0) * 1024;
    if (left === 0 || bytesPerSecond <= 0) return null;
    return Math.round(left / bytesPerSecond);
}

/** Detail-only fields of a shared file (amuleapi's GET /shared/{hash}). */
const SHARED_DETAIL_ONLY = ['directory', 'partSources', 'rating', 'media'] as const satisfies ReadonlyArray<keyof SharedFile>;

/**
 * A shared file as its details view shows it: the live list entry plus what
 * only amuleapi's detail view carries. The list leaves the path, the comment
 * and the queue length blank over amuleapi, so the detail's reading wins there.
 */
export function mergeSharedDetail(live: SharedFile | null | undefined, detail: SharedFile | null | undefined): SharedFile | null {
    if (!live) return null;
    if (!detail || detail.hash !== live.hash) return live;

    const merged: SharedFile = { ...live };
    for (const key of SHARED_DETAIL_ONLY) {
        if (detail[key] !== undefined) (merged as any)[key] = detail[key];
    }
    merged.fullPath = live.fullPath || detail.fullPath;
    merged.comment = live.comment || detail.comment;
    merged.onQueue = live.onQueue || detail.onQueue;
    return merged;
}
