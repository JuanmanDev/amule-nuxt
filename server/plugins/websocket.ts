/**
 * Live updates over a WebSocket of its own.
 *
 * Nitro has no portable way to hand a plugin the HTTP server it is about to
 * listen on, so the push channel gets its own port rather than sharing one. The
 * port is configurable so a preview next to a dev server, or several containers
 * on one host, do not collide.
 *
 * The browser is told which port to dial through `runtimeConfig.public.wsPort`,
 * which is resolved from WS_PORT when the app is *built*. So a deployment that
 * moves the port has to pass NUXT_PUBLIC_WS_PORT as well, or the page keeps
 * sending browsers to the built-in default while this server listens elsewhere:
 * live updates report as unavailable and every page falls back to polling.
 *
 * Both launchers do that for you (docker-entrypoint.sh and the start scripts in
 * the release zip default NUXT_PUBLIC_WS_PORT to WS_PORT). It cannot be done
 * here: the runtime config is frozen by the time a Nitro plugin runs.
 *
 * The daemon itself is read by `amuleMonitor`, which this only subscribes to -
 * one loop feeds both the live push and the notifications.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { latestFrame, onDownloadEvents, onFrame, setWatcherCount } from '../utils/amuleMonitor';
import { useLogger } from '../utils/logger';

const log = useLogger('websocket');

export default defineNitroPlugin((nitroApp) => {
    const WS_PORT = Number(process.env.WS_PORT ?? 3001);
    const announced = Number(useRuntimeConfig().public.wsPort ?? 3001);

    if (announced !== WS_PORT) {
        log.warn(
            `Listening for live updates on ${WS_PORT} but telling browsers ${announced}: `
            + `set NUXT_PUBLIC_WS_PORT=${WS_PORT} as well, or clients will fall back to polling`
        );
    }

    const wss = new WebSocketServer({ port: WS_PORT });

    wss.on('listening', () => log.info(`WebSocket server listening on port ${WS_PORT}`));

    // A bind failure must not take the whole server down: without the push the UI
    // falls back to polling, which every page already handles.
    wss.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
            log.warn(`Port ${WS_PORT} is already in use, live updates are disabled (set WS_PORT to change it)`);
        } else {
            log.warn('WebSocket server error, live updates are disabled', error);
        }
    });

    const broadcast = (data: unknown) => {
        const message = JSON.stringify(data);
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    };

    const stopListening = onFrame(frame => {
        if (wss.clients.size === 0) return;
        broadcast({ type: 'status_update', data: frame });
    });

    // Open tabs get the same events the push notifications carry, so a browser
    // that is already looking at the app is told by the app rather than by the
    // operating system.
    const stopEvents = onDownloadEvents(events => {
        if (wss.clients.size === 0) return;
        broadcast({ type: 'download_events', data: { events } });
    });

    wss.on('connection', (ws) => {
        log.debug('Client connected');
        setWatcherCount(wss.clients.size);

        ws.on('close', () => setWatcherCount(wss.clients.size));

        // Whatever the monitor read last, so a fresh tab is filled immediately
        // without an EC round trip of its own. Note what is *not* sent when there
        // is no reading yet: an empty `downloads` array, which the browser cannot
        // tell from "the queue is empty" and which used to blank the list on every
        // reconnect.
        const frame = latestFrame();
        if (frame) {
            ws.send(JSON.stringify({ type: 'status_update', data: frame }));
        }
    });

    nitroApp.hooks.hook('close', () => {
        stopListening();
        stopEvents();
        wss.close();
    });
});
