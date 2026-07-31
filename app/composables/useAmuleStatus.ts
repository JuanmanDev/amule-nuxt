/**
 * Composable for real-time aMule status polling
 *
 * Keeps the last status it managed to read and reports the failure separately,
 * so a page can keep rendering (with a stale but labelled value) instead of
 * sitting on a loading skeleton for as long as the daemon is unreachable.
 */

/** While the daemon is down the interval is stretched by this factor. */
const POLL_WHEN_DOWN_FACTOR = 3;

export const useAmuleStatus = (intervalMs: number = 5000) => {
    const api = useAmuleApi();
    const status = ref<any>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    /** False until the first attempt resolved, whatever its outcome. */
    const settled = ref(false);
    let timer: NodeJS.Timeout | null = null;
    let inFlight = false;
    let stopped = false;

    const fetchStatus = async () => {
        // The daemon serves one EC connection, so overlapping polls only queue
        // up behind each other and make every other request slower.
        if (inFlight) return;
        inFlight = true;
        loading.value = true;

        try {
            const result = await api.getStatus();
            if (result.success && result.data) {
                status.value = result.data;
                error.value = null;
            } else {
                // Keep the previous snapshot: a stale speed reads better than a
                // page that turns into skeletons the moment the daemon hiccups.
                error.value = result.error || 'Failed to fetch status';
            }
        } catch (e: any) {
            error.value = e.message || 'Failed to fetch status';
        } finally {
            inFlight = false;
            loading.value = false;
            settled.value = true;
        }
    };

    /** Self-scheduling poll, so it can back off while the daemon is down. */
    const scheduleNext = () => {
        if (stopped) return;
        const delay = error.value ? intervalMs * POLL_WHEN_DOWN_FACTOR : intervalMs;
        timer = setTimeout(async () => {
            await fetchStatus();
            scheduleNext();
        }, delay);
    };

    const startPolling = () => {
        stopped = false;
        fetchStatus().then(scheduleNext);
    };

    const stopPolling = () => {
        stopped = true;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    onMounted(() => {
        startPolling();
    });

    onUnmounted(() => {
        stopPolling();
    });

    return {
        status,
        loading,
        error,
        settled,
        fetchStatus,
        startPolling,
        stopPolling
    };
};
