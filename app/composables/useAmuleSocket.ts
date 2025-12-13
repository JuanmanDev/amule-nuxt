import { ref, onMounted, onUnmounted } from 'vue';

export interface WebSocketStatus {
    connected: boolean;
    error: string | null;
}

export function useAmuleSocket() {
    const ws = ref<WebSocket | null>(null);
    const wsStatus = ref<WebSocketStatus>({
        connected: false,
        error: null
    });

    // Reactive state for data received via WS
    const realtimeStatus = ref<any>(null);
    const realtimeDownloads = ref<any[]>([]);

    let reconnectTimer: any = null;

    const connect = () => {
        // Determine WS URL
        // If in browser, use hostname. Port 3001 (hardcoded for now as per server implementation)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const hostname = window.location.hostname;
        const port = '3001'; // Default WS port
        const url = `${protocol}//${hostname}:${port}`;

        try {
            ws.value = new WebSocket(url);

            ws.value.onopen = () => {
                wsStatus.value.connected = true;
                wsStatus.value.error = null;
                // console.log('WebSocket connected');
            };

            ws.value.onclose = () => {
                wsStatus.value.connected = false;
                // console.log('WebSocket disconnected, retrying in 3s...');
                reconnectTimer = setTimeout(connect, 3000);
            };

            ws.value.onerror = (err) => {
                wsStatus.value.error = 'Connection error';
                console.error('WebSocket error:', err);
                ws.value?.close();
            };

            ws.value.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === 'status_update') {
                        realtimeStatus.value = message.data.status;
                        realtimeDownloads.value = message.data.downloads;
                    }
                } catch (e) {
                    console.error('Error parsing WS message:', e);
                }
            };

        } catch (e) {
            console.error('Failed to create WebSocket:', e);
        }
    };

    onMounted(() => {
        connect();
    });

    onUnmounted(() => {
        if (ws.value) {
            ws.value.close();
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
        }
    });

    return {
        wsStatus,
        realtimeStatus,
        realtimeDownloads
    };
}
