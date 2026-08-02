/**
 * Single source of truth for the download queue.
 *
 * Both the dashboard summary and the downloads page use this, so queue state,
 * command handling and error reporting cannot drift apart. State is kept in
 * `useState` so several components share one queue and one poll loop.
 */

import type { Download } from '../../server/utils/amule-types';
import type { AddLinkResult } from '#shared/types/api';
import { classifyDownload, isLikelyDeadLink } from '#shared/utils/downloadHealth';
import { summariseAddResults, type AddLinksSummary } from '#shared/utils/addLinks';

export type DownloadPriorityName = 'Auto' | 'High' | 'Normal' | 'Low';

export interface AddLinksOutcome {
    /** True when no link was refused. */
    ok: boolean;
    results: AddLinkResult[];
    summary: AddLinksSummary;
}

/** aMule identifies every download by its 32 hex char file hash. */
export function isValidDownloadHash(hash: unknown): hash is string {
    return typeof hash === 'string' && /^[0-9a-f]{32}$/i.test(hash);
}

export const useDownloads = () => {
    const api = useAmuleApi();
    const toast = useToast();
    const { wsStatus, realtimeDownloads } = useAmuleSocket();

    // The queue itself lives in the prefetched feed, so it is already loaded
    // whichever page the user opens first and it keeps refreshing in the
    // background while they are elsewhere.
    const feed = useDownloadsFeed();
    const downloads = feed.items;
    const loading = feed.loading;
    const error = feed.error;
    const busyHash = useState<string | null>('amule-downloads-busy', () => null);

    /** Real-time data when the socket is up, otherwise the polled queue. */
    const items = computed<Download[]>(() => {
        if (wsStatus.value.connected && realtimeDownloads.value.length > 0) {
            return realtimeDownloads.value as Download[];
        }
        return downloads.value;
    });

    const activeCount = computed(() =>
        items.value.filter(item => classifyDownload(item).health === 'downloading').length
    );
    /**
     * Entries with no source and nothing received. Normal right after adding a
     * link, so the summaries call it "searching" rather than a failure.
     */
    const searchingCount = computed(() => items.value.filter(item => isLikelyDeadLink(item)).length);
    const totalSpeed = computed(() => items.value.reduce((sum, item) => sum + (item.speed || 0), 0));

    /**
     * Reads the queue now. `silent` is kept for call sites that used it; the feed
     * never drops back to the loading state once it holds data, so a refresh is
     * always silent in practice.
     */
    async function fetchDownloads(_options: { silent?: boolean } = {}) {
        await feed.refresh({ force: true });
    }

    /**
     * Runs a queue command and reports the daemon's own message. Entries without
     * a usable hash are refused up front, since the API needs one in the path.
     */
    async function runCommand(
        download: Pick<Download, 'hash'>,
        action: () => Promise<{ success: boolean; message?: string; error?: string }>,
        fallbackTitle: string,
        color: 'success' | 'warning' = 'success'
    ): Promise<boolean> {
        if (!isValidDownloadHash(download.hash)) {
            toast.add({
                title: 'Action unavailable',
                description: 'aMule did not report a file hash for this download.',
                color: 'error'
            });
            return false;
        }

        busyHash.value = download.hash;
        try {
            const result = await action();
            if (result.success) {
                toast.add({ title: result.message || fallbackTitle, color });
                await fetchDownloads({ silent: true });
                return true;
            }

            toast.add({
                title: fallbackTitle,
                description: result.error || result.message,
                color: 'error'
            });
            return false;
        } catch (e: any) {
            toast.add({ title: 'Error', description: e.message, color: 'error' });
            return false;
        } finally {
            busyHash.value = null;
        }
    }

    const pause = (download: Download) =>
        runCommand(download, () => api.pauseDownload(download.hash), 'Failed to pause');

    const resume = (download: Download) =>
        runCommand(download, () => api.resumeDownload(download.hash), 'Failed to resume');

    const remove = (download: Download) =>
        runCommand(download, () => api.cancelDownload(download.hash), 'Failed to remove', 'warning');

    const setPriority = (download: Download, priority: DownloadPriorityName) =>
        runCommand(download, () => api.setPriority(download.hash, priority), 'Failed to set priority');

    /**
     * The single add-link path used by every page and component.
     *
     * Reports one toast built by the shared summariser, so an already queued or
     * already shared file reads the same everywhere, and returns the per-link
     * results for callers that render them (the batch modal).
     */
    async function addLinks(input: string | string[]): Promise<AddLinksOutcome> {
        const links = (Array.isArray(input) ? input : [input])
            .map(link => link.trim())
            .filter(link => link.length > 0);

        if (links.length === 0) {
            toast.add({ title: 'Please enter a link', color: 'warning' });
            return { ok: false, results: [], summary: summariseAddResults(null) };
        }

        try {
            const result = await api.addDownload(links.length === 1 ? links[0]! : links);
            const summary = summariseAddResults(result.data);

            toast.add({
                title: summary.title,
                description: summary.description,
                color: summary.color
            });

            await fetchDownloads({ silent: true });

            return {
                // "ok" means nothing was refused, so the input can be cleared
                ok: result.success,
                results: result.data?.results ?? [],
                summary
            };
        } catch (e: any) {
            toast.add({ title: 'Error', description: e.message, color: 'error' });
            return { ok: false, results: [], summary: summariseAddResults(null) };
        }
    }

    /**
     * Asks for the fast refresh cadence while the calling component is mounted.
     *
     * The polling loop itself belongs to the feed (see `useAmuleFeeds`), which
     * runs for the whole session; a page only says "I am showing this now".
     */
    function startPolling() {
        feed.focus();
    }

    return {
        items,
        loading,
        error,
        busyHash,
        wsStatus,
        activeCount,
        searchingCount,
        totalSpeed,
        fetchDownloads,
        startPolling,
        addLinks,
        pause,
        resume,
        remove,
        setPriority
    };
};
