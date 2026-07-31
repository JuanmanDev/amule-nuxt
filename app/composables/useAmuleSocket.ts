import { ref, onMounted, onUnmounted } from 'vue';

export interface WebSocketStatus {
    connected: boolean;
    error: string | null;
}

/**
 * Live push channel, shared by every component that asks for it.
 *
 * The dashboard, the download queue and the app shell all want the same stream,
 * and one socket per consumer meant N sockets and N reconnect loops - which is
 * what turned an unavailable push server into a storm of retries.
 */
// Module scope is safe here because everything below is only ever written in the
// browser: during SSR these keep their initial values and the pages fall back to
// polling.
const wsStatus = ref<WebSocketStatus>({ connected: false, error: null });
const realtimeStatus = ref<any>(null);
const realtimeDownloads = ref<any[]>([]);

/** Reconnect backoff: fast while it looks like a hiccup, slow once it does not. */
const RECONNECT_MIN_MS = 2000;
const RECONNECT_MAX_MS = 30000;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = RECONNECT_MIN_MS;
let consumers = 0;

function scheduleReconnect() {
    if (reconnectTimer || consumers === 0) return;

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        openSocket();
    }, reconnectDelay);

    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function openSocket() {
    if (socket || consumers === 0) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    const config = useRuntimeConfig();
    const port = String(config.public.wsPort || 3001);
    const url = `${protocol}//${hostname}:${port}`;

    try {
        const ws = new WebSocket(url);
        socket = ws;

        ws.onopen = () => {
            wsStatus.value.connected = true;
            wsStatus.value.error = null;
            reconnectDelay = RECONNECT_MIN_MS;
        };

        ws.onclose = () => {
            if (socket === ws) socket = null;
            wsStatus.value.connected = false;
            // Polling covers the gap, so a missing push server only costs
            // freshness - never a broken page.
            scheduleReconnect();
        };

        ws.onerror = () => {
            wsStatus.value.error = 'Live updates unavailable';
            ws.close();
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'status_update') {
                    realtimeStatus.value = message.data.status;
                    realtimeDownloads.value = message.data.downloads;
                }
            } catch {
                // A malformed frame is not worth dropping the connection over
                wsStatus.value.error = 'Received an unreadable live update';
            }
        };
    } catch {
        socket = null;
        wsStatus.value.connected = false;
        wsStatus.value.error = 'Live updates unavailable';
        scheduleReconnect();
    }
}

export function useAmuleSocket() {
    onMounted(() => {
        consumers += 1;
        openSocket();
    });

    onUnmounted(() => {
        consumers = Math.max(0, consumers - 1);

        // Last consumer leaving closes the shared socket and stops retrying.
        if (consumers === 0) {
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            if (socket) {
                const ws = socket;
                socket = null;
                ws.onclose = null;
                ws.close();
            }
            wsStatus.value.connected = false;
        }
    });

    return {
        wsStatus,
        realtimeStatus,
        realtimeDownloads
    };
}
