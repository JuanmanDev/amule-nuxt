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

    const downloads = useState<Download[]>('amule-downloads', () => []);
    // Loading is the initial state: the UI must never show "empty" before the
    // first fetch has resolved.
    const loading = useState<boolean>('amule-downloads-loading', () => true);
    const error = useState<string | null>('amule-downloads-error', () => null);
    const busyHash = useState<string | null>('amule-downloads-busy', () => null);
    // Shared across every consumer: the dashboard and the queue page poll the
    // same endpoint, and a slow daemon must not turn that into a backlog.
    const inFlight = useState<boolean>('amule-downloads-in-flight', () => false);

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
    const stalledCount = computed(() => items.value.filter(item => isLikelyDeadLink(item)).length);
    const totalSpeed = computed(() => items.value.reduce((sum, item) => sum + (item.speed || 0), 0));

    async function fetchDownloads({ silent = false }: { silent?: boolean } = {}) {
        if (inFlight.value) return;
        inFlight.value = true;

        if (!silent && items.value.length === 0) {
            loading.value = true;
        }

        try {
            const result = await api.getDownloads();
            if (result.success) {
                downloads.value = result.data ?? [];
                error.value = null;
            } else {
                // The last known queue stays on screen; the error explains why
                // it is not moving.
                error.value = result.error || 'Failed to load downloads';
            }
        } catch (e: any) {
            error.value = e.message || 'Failed to load downloads';
        } finally {
            inFlight.value = false;
            loading.value = false;
        }
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
     * Starts the initial fetch plus a polling fallback used whenever the
     * WebSocket push is unavailable. Call from a component's setup.
     */
    function startPolling(intervalMs = 5000) {
        let timer: ReturnType<typeof setInterval> | undefined;

        onMounted(() => {
            fetchDownloads();
            timer = setInterval(() => {
                if (!wsStatus.value.connected) {
                    fetchDownloads({ silent: true });
                }
            }, intervalMs);
        });

        onUnmounted(() => {
            if (timer) clearInterval(timer);
        });
    }

    return {
        items,
        loading,
        error,
        busyHash,
        wsStatus,
        activeCount,
        stalledCount,
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
