/**
 * What this daemon already knows about a file hash.
 *
 * A search result is not just "a file out there": it may already be in the
 * download queue, paused, finished, or sitting in the shared folders from months
 * ago. Offering "Download" for all four is what made the search page feel blind —
 * you clicked, and the only feedback was a toast saying it was already queued.
 *
 * Both lists are already in memory and kept warm by the feeds, so answering this
 * costs nothing: two maps, rebuilt only when a list actually changes.
 */

import type { Download, SharedFile } from '../../server/utils/amule-types';
import { classifyDownload } from '#shared/utils/downloadHealth';

export type FileState = 'unknown' | 'queued' | 'downloading' | 'paused' | 'completed' | 'shared';

export interface FileStatus {
    state: FileState;
    /** Short label for a badge: "Downloading", "Completed", "In queue"... */
    label: string;
    color: 'neutral' | 'primary' | 'success' | 'warning' | 'info';
    /** 0-100 while a download is in progress, 100 when it is finished. */
    percent: number;
    /** True once the file is on this machine in full. */
    done: boolean;
    /** The queue entry, when there is one. */
    download?: Download;
    /** The shared file, when the hash is in the shared list. */
    shared?: SharedFile;
}

const UNKNOWN: FileStatus = { state: 'unknown', label: '', color: 'neutral', percent: 0, done: false };

export const useFileStatus = () => {
    const downloads = useDownloadsFeed();
    const shared = useSharedFilesFeed();

    const downloadsByHash = computed(() => {
        const map = new Map<string, Download>();
        for (const download of downloads.items.value) {
            if (download.hash) map.set(download.hash.toLowerCase(), download);
        }
        return map;
    });

    const sharedByHash = computed(() => {
        const map = new Map<string, SharedFile>();
        for (const file of shared.items.value) {
            if (file.hash) map.set(file.hash.toLowerCase(), file);
        }
        return map;
    });

    /**
     * The queue wins over the shared list.
     *
     * aMule shares a partfile while it is still downloading, so a file in progress
     * is in both lists; the queue is the one that knows how far along it is.
     */
    function statusOf(hash: string | undefined | null): FileStatus {
        if (!hash) return UNKNOWN;

        const key = hash.toLowerCase();
        const download = downloadsByHash.value.get(key);

        if (download) {
            const health = classifyDownload(download);
            const percent = download.percentComplete;

            if (download.status === 'Complete' || percent >= 100) {
                return { state: 'completed', label: 'Completed', color: 'success', percent: 100, done: true, download };
            }

            if (download.status === 'Paused' || download.stopped) {
                return { state: 'paused', label: 'Paused', color: 'warning', percent, done: false, download };
            }

            return health.health === 'downloading'
                ? { state: 'downloading', label: 'Downloading', color: 'primary', percent, done: false, download }
                : { state: 'queued', label: 'In queue', color: 'info', percent, done: false, download };
        }

        const file = sharedByHash.value.get(key);
        if (file) {
            // In the shared list and not in the queue: this daemon has the whole file
            return { state: 'shared', label: 'Already shared', color: 'success', percent: 100, done: true, shared: file };
        }

        return UNKNOWN;
    }

    return { statusOf, downloadsByHash, sharedByHash };
};
