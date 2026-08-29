/**
 * Live push channel, shared by every component that asks for it.
 *
 * The dashboard, the download queue and the app shell all want the same stream,
 * and one socket per consumer meant N sockets and N reconnect loops - which is
 * what turned an unavailable push server into a storm of retries.
 *
 * The connection lasts for the whole session rather than for as long as some
 * component happens to be mounted. Tying it to components meant every navigation
 * closed and reopened it, and each reopen replayed a fresh snapshot over the
 * download queue: the list was rebuilt from scratch several times a minute just
 * from walking around the app.
 */

import type { Download } from '../../server/utils/amule-types';
import type { DownloadEvent } from '../../server/utils/downloadEvents';
import { useDemoDaemon } from '~/plugins/demo.client';

export interface WebSocketStatus {
    connected: boolean;
    error: string | null;
}

// Module scope is safe here because everything below is only ever written in the
// browser: during SSR these keep their initial values and the pages fall back to
// polling.
const wsStatus = ref<WebSocketStatus>({ connected: false, error: null });
const realtimeStatus = ref<any>(null);
const realtimeDownloads = ref<Download[]>([]);
/**
 * The last batch of queue events the server reported.
 *
 * A ref rather than a callback list so that whoever cares can just watch it, and
 * so a batch that arrives before the notifications plugin is ready is not lost.
 */
const downloadEvents = ref<DownloadEvent[]>([]);

/** Reconnect backoff: fast while it looks like a hiccup, slow once it does not. */
const RECONNECT_MIN_MS = 2000;
const RECONNECT_MAX_MS = 30000;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = RECONNECT_MIN_MS;
/**
 * The Nuxt app the socket was opened from. Frames arrive outside any component,
 * so writing to shared state (`useState`) has to be wrapped in its context.
 */
let host: ReturnType<typeof useNuxtApp> | null = null;
/** Demo build only: undoes the subscription to the in-browser daemon. */
let demoDetach: (() => void) | null = null;
/** The wake listeners are attached once per tab, not once per caller. */
let wakeListenersAttached = false;

function scheduleReconnect() {
    if (reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, reconnectDelay);

    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

/** Applies one frame. Absent sections are left alone rather than blanked. */
function applyFrame(message: any) {
    if (message?.type === 'download_events') {
        if (Array.isArray(message.data?.events) && message.data.events.length > 0) {
            downloadEvents.value = message.data.events;
        }
        return;
    }

    if (message?.type !== 'status_update') return;

    if (message.data?.status) {
        realtimeStatus.value = message.data.status;
    }

    // A missing `downloads` is "no news", an empty array is "the queue is empty".
    // Collapsing the two is what used to wipe the list on every reconnect.
    if (Array.isArray(message.data?.downloads)) {
        const list = message.data.downloads as Download[];
        realtimeDownloads.value = list;
        host?.runWithContext(() => applyLiveDownloads(list));
    }
}

function connect() {
    if (socket) return;

    // The static demo has no push server: the in-browser daemon is the feed
    if (useRuntimeConfig().public.demo) {
        if (demoDetach) return;
        const daemon = useDemoDaemon();
        if (!daemon) return;
        const stopFrames = daemon.onFrame(frame => applyFrame({ type: 'status_update', data: frame }));
        const stopEvents = daemon.onDownloadEvents(events => applyFrame({ type: 'download_events', data: { events } }));
        demoDetach = () => { stopFrames(); stopEvents(); };
        applyFrame({ type: 'status_update', data: daemon.latestFrame() });
        wsStatus.value = { connected: true, error: null };
        return;
    }

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
                applyFrame(JSON.parse(event.data));
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

/**
 * Reconnects at once instead of waiting out the backoff.
 *
 * A browser that freezes a background tab closes its sockets, and the tab can
 * sit there for hours: by the time the user comes back the retry timer is at its
 * slowest and the page would stay dead for another half minute for no reason.
 * Returning to the tab, or regaining the network, is good evidence that this
 * attempt will go better than the last, so the backoff is dropped.
 *
 * A socket left in CLOSING is also treated as gone. `onclose` still fires and
 * clears the reference, so nothing is leaked by replacing it here.
 */
function reconnectNow(): void {
    if (document.visibilityState !== 'visible') return;

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    reconnectDelay = RECONNECT_MIN_MS;

    if (socket && socket.readyState !== WebSocket.CLOSING && socket.readyState !== WebSocket.CLOSED) return;

    socket = null;
    connect();
}

/**
 * Opens the shared socket if it is not already open. Idempotent, so every caller
 * can ask without coordinating; called once by the prefetch plugin in practice.
 */
export function openAmuleSocket(): void {
    if (import.meta.server) return;
    host ??= useNuxtApp();

    if (!wakeListenersAttached) {
        wakeListenersAttached = true;
        document.addEventListener('visibilitychange', reconnectNow);
        window.addEventListener('online', reconnectNow);
        window.addEventListener('pageshow', reconnectNow);
    }

    connect();
}

/** Only used to stop a dev-server reload leaving the previous socket behind. */
export function closeAmuleSocket(): void {
    if (demoDetach) {
        demoDetach();
        demoDetach = null;
    }
    if (wakeListenersAttached) {
        wakeListenersAttached = false;
        document.removeEventListener('visibilitychange', reconnectNow);
        window.removeEventListener('online', reconnectNow);
        window.removeEventListener('pageshow', reconnectNow);
    }
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

export function useAmuleSocket() {
    // Mounting a consumer no longer owns the socket's lifetime; it only makes
    // sure there is one, for the case where a page is rendered without the
    // plugin having run (tests, or a page opened directly during SSR hydration).
    onMounted(openAmuleSocket);

    return {
        wsStatus,
        realtimeStatus,
        realtimeDownloads,
        downloadEvents
    };
}
