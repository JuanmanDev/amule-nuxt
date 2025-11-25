/**
 * Composable for real-time aMule status polling
 * Auto-refreshes status at specified interval
 */

export const useAmuleStatus = (intervalMs: number = 5000) => {
    const api = useAmuleApi();
    const status = ref<any>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    let intervalId: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
        try {
            loading.value = true;
            error.value = null;
            const result = await api.getStatus();
            status.value = result.data;
        } catch (e: any) {
            error.value = e.message || 'Failed to fetch status';
            console.error('Status fetch error:', e);
        } finally {
            loading.value = false;
        }
    };

    const startPolling = () => {
        fetchStatus(); // Initial fetch
        intervalId = setInterval(fetchStatus, intervalMs);
    };

    const stopPolling = () => {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
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
        fetchStatus,
        startPolling,
        stopPolling
    };
};
