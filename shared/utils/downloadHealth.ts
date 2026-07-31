/**
 * Classifies a queued download so the UI can distinguish "working on it" from
 * "this will never start".
 *
 * A structurally valid ed2k link whose hash does not exist on the network still
 * creates a partfile: aMule keeps it at 0% with zero sources forever. Without a
 * dedicated state that entry looks the same as a download that is merely waiting
 * for a slot, which is what made a mistyped link look like a stuck download.
 */

export type DownloadHealth =
    | 'complete'
    | 'downloading'
    | 'waiting'
    | 'stalled'
    | 'paused'
    | 'stopped'
    | 'hashing'
    | 'error';

export interface DownloadHealthInfo {
    health: DownloadHealth;
    /** Short label for a badge. */
    label: string;
    /** Nuxt UI colour token for that badge. */
    color: 'success' | 'info' | 'warning' | 'error' | 'neutral';
    /** Explanation shown next to the entry, when there is something to explain. */
    reason?: string;
}

/** Minimal shape needed to classify; matches the Download API payload. */
export interface DownloadHealthInput {
    status?: string;
    speed?: number;
    sources?: number;
    sourcesXfer?: number;
    sizeDone?: number;
    percentComplete?: number;
    stopped?: boolean;
}

const NO_SOURCES_REASON =
    'aMule has not found any source for this file. If the link was typed or edited by hand, '
    + 'check the file size and the 32 character hash - a wrong hash creates a download that can never start.';

export function classifyDownload(download: DownloadHealthInput): DownloadHealthInfo {
    const status = download.status ?? 'Waiting';
    const sources = download.sources ?? 0;
    const speed = download.speed ?? 0;
    const sourcesXfer = download.sourcesXfer ?? 0;
    const sizeDone = download.sizeDone ?? 0;

    if (status === 'Complete') {
        return { health: 'complete', label: 'Complete', color: 'success' };
    }

    if (status === 'Error') {
        return { health: 'error', label: 'Error', color: 'error', reason: 'aMule reported this file as erroneous.' };
    }

    if (status === 'Hashing') {
        return { health: 'hashing', label: 'Hashing', color: 'info' };
    }

    if (download.stopped) {
        return { health: 'stopped', label: 'Stopped', color: 'neutral' };
    }

    if (status === 'Paused') {
        return { health: 'paused', label: 'Paused', color: 'neutral' };
    }

    if (speed > 0 || sourcesXfer > 0) {
        return { health: 'downloading', label: 'Downloading', color: 'success' };
    }

    if (sources === 0) {
        return {
            health: 'stalled',
            label: 'No sources',
            color: 'warning',
            reason: sizeDone > 0
                ? 'All sources for this file went offline. It will resume automatically if one comes back.'
                : NO_SOURCES_REASON
        };
    }

    return {
        health: 'waiting',
        label: 'Waiting',
        color: 'info',
        reason: `Queued at ${sources} source${sources === 1 ? '' : 's'}, waiting for a free upload slot.`
    };
}

/** True for entries that never received a single byte and have no source. */
export function isLikelyDeadLink(download: DownloadHealthInput): boolean {
    return classifyDownload(download).health === 'stalled' && (download.sizeDone ?? 0) === 0;
}
