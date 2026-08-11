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

/** The queue commands that can be applied to a whole selection. */
export type BulkAction = 'pause' | 'resume' | 'remove';

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
    const { t } = useI18n();
    // Only for the "Live" badge: the socket's data goes into the feed, not here.
    const { wsStatus } = useAmuleSocket();

    // The queue itself lives in the prefetched feed, so it is already loaded
    // whichever page the user opens first and it keeps refreshing in the
    // background while they are elsewhere.
    const feed = useDownloadsFeed();
    const loading = feed.loading;
    const error = feed.error;
    const busyHash = useState<string | null>('amule-downloads-busy', () => null);

    /**
     * The queue, from one place.
     *
     * Live pushes and the HTTP poll both write into this feed (see
     * `applyLiveDownloads`), merged by hash. Choosing between two arrays here
     * instead is what made the list flicker: whenever the choice flipped, every
     * row was a new object and the whole queue animated out and back in.
     */
    const items = feed.items;

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
        runCommand(download, () => api.pauseDownload(download.hash), t('downloads.failedToPause'));

    const resume = (download: Download) =>
        runCommand(download, () => api.resumeDownload(download.hash), t('downloads.failedToResume'));

    const remove = (download: Download) =>
        runCommand(download, () => api.cancelDownload(download.hash), t('downloads.failedToRemove'), 'warning');

    const setPriority = (download: Download, priority: DownloadPriorityName) =>
        runCommand(download, () => api.setPriority(download.hash, priority), t('downloads.failedToSetPriority'));

    /**
     * Runs one command over a selection.
     *
     * Sequential, deliberately: the daemon serves a single EC connection, so
     * firing twenty requests at once only queues them behind each other while
     * making every other page wait. One toast at the end rather than one per
     * file, and one refresh, so a selection of fifty does not produce fifty of
     * each.
     */
    async function runBulk(downloads: readonly Download[], action: BulkAction): Promise<{ done: number; failed: number }> {
        const valid = downloads.filter(download => isValidDownloadHash(download.hash));
        let done = 0;
        let failed = 0;

        for (const download of valid) {
            busyHash.value = download.hash;
            try {
                const result = action === 'pause'
                    ? await api.pauseDownload(download.hash)
                    : action === 'resume'
                        ? await api.resumeDownload(download.hash)
                        : await api.cancelDownload(download.hash);

                if (result.success) done += 1;
                else failed += 1;
            } catch {
                failed += 1;
            }
        }

        busyHash.value = null;
        await fetchDownloads({ silent: true });

        const skipped = downloads.length - valid.length;
        toast.add({
            // `done` twice: the number to print, and the plural form to pick
            title: t(`downloads.bulk.${action}Done`, { count: done }, done),
            // Everything that did not work, in one line: a per-file failure toast
            // for a selection of fifty is unreadable
            description: failed + skipped > 0
                ? t('downloads.bulk.someFailed', { count: failed + skipped })
                : undefined,
            color: failed + skipped > 0 ? 'warning' : (action === 'remove' ? 'warning' : 'success')
        });

        return { done, failed: failed + skipped };
    }

    const pauseMany = (downloads: readonly Download[]) => runBulk(downloads, 'pause');
    const resumeMany = (downloads: readonly Download[]) => runBulk(downloads, 'resume');
    const removeMany = (downloads: readonly Download[]) => runBulk(downloads, 'remove');

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
        setPriority,
        pauseMany,
        resumeMany,
        removeMany
    };
};
