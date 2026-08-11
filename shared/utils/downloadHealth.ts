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
    /** No source found yet and nothing received: still looking. */
    | 'searching'
    /** Had sources, or received data, and now has none. */
    | 'stalled'
    | 'paused'
    | 'stopped'
    | 'hashing'
    | 'error';

export interface DownloadHealthInfo {
    health: DownloadHealth;
    /**
     * Short label for a badge, in English.
     *
     * Still here because it is what the MCP tools and the logs report, where the
     * audience is a program or an operator rather than the person using the app.
     * The interface renders `labelKey` through the message catalogue instead.
     */
    label: string;
    /** Message key for `label`, under `health.`. */
    labelKey: string;
    /** Nuxt UI colour token for that badge. */
    color: 'success' | 'info' | 'warning' | 'error' | 'neutral';
    /** Explanation shown next to the entry, when there is something to explain. */
    reason?: string;
    /** Message key for `reason`, when there is one. */
    reasonKey?: string;
    /** Values `reasonKey` interpolates, when it takes any. */
    reasonValues?: Record<string, string | number>;
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

/*
 * Shown the moment a download is added, when nothing has arrived yet and no
 * source is known. That is the normal state for the first seconds or minutes, so
 * the wording leads with the search and keeps the diagnosis as the follow-up:
 * "no source" on a brand new entry read like a failure when it usually is not.
 */
const SEARCHING_REASON =
    'Searching for sources. aMule asks the eD2k servers and Kad, which normally takes '
    + 'seconds but can take a few minutes for a rare file. If it stays like this: check that '
    + 'the link\'s file size and 32 character hash are exactly as published (a wrong hash '
    + 'creates a download that can never start), connect to more servers and to Kad, and '
    + 'consider that nobody may be sharing the file any more.';

export function classifyDownload(download: DownloadHealthInput): DownloadHealthInfo {
    const status = download.status ?? 'Waiting';
    const sources = download.sources ?? 0;
    const speed = download.speed ?? 0;
    const sourcesXfer = download.sourcesXfer ?? 0;
    const sizeDone = download.sizeDone ?? 0;

    if (status === 'Complete') {
        return { health: 'complete', label: 'Complete', labelKey: 'health.complete', color: 'success' };
    }

    if (status === 'Error') {
        return {
            health: 'error',
            label: 'Error',
            labelKey: 'health.error',
            color: 'error',
            reason: 'aMule reported this file as erroneous.',
            reasonKey: 'health.errorReason'
        };
    }

    if (status === 'Hashing') {
        return { health: 'hashing', label: 'Hashing', labelKey: 'health.hashing', color: 'info' };
    }

    if (download.stopped) {
        return { health: 'stopped', label: 'Stopped', labelKey: 'health.stopped', color: 'neutral' };
    }

    if (status === 'Paused') {
        return { health: 'paused', label: 'Paused', labelKey: 'health.paused', color: 'neutral' };
    }

    if (speed > 0 || sourcesXfer > 0) {
        return { health: 'downloading', label: 'Downloading', labelKey: 'health.downloading', color: 'success' };
    }

    if (sources === 0) {
        // Nothing received yet is a search in progress; data already on disk means
        // the sources that were there have gone away, which is a different story
        return sizeDone > 0
            ? {
                health: 'stalled',
                label: 'No sources',
                labelKey: 'health.noSources',
                color: 'warning',
                reason: 'All sources for this file went offline. It will resume automatically if one comes back.',
                reasonKey: 'health.stalledReason'
            }
            : {
                health: 'searching',
                label: 'Searching',
                labelKey: 'health.searching',
                color: 'info',
                reason: SEARCHING_REASON,
                reasonKey: 'health.searchingReason'
            };
    }

    return {
        health: 'waiting',
        label: 'Waiting',
        labelKey: 'health.waiting',
        color: 'info',
        reason: `Queued at ${sources} source${sources === 1 ? '' : 's'}, waiting for a free upload slot.`,
        reasonKey: 'health.waitingReason',
        reasonValues: { count: sources }
    };
}

/** True for entries that never received a single byte and have no source. */
export function isLikelyDeadLink(download: DownloadHealthInput): boolean {
    return classifyDownload(download).health === 'searching' && (download.sizeDone ?? 0) === 0;
}
