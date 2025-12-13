import { WebSocketServer, WebSocket } from 'ws';
import { getAmuleClient } from '../utils/getAmuleClient';
import type { IncomingMessage } from 'http';

export default defineNitroPlugin((nitroApp) => {
    // Only set up WebSocket server if we are running in a way that supports it
    // Nitro handles HTTP server creation, but we need to hook into it
    // Note: Nuxt 4 (nitro 2.x+) has experimental websocket support, but standard 'ws' library
    // works well by attaching to the node server.

    // However, Nitro plugins run before server starts listening.
    // We can use the 'request' hook or just setup a separate WS server or attach to existing one if possible.
    // Since we don't have direct access to the `server` object in Nitro plugin easily without hooks.

    // Better approach: Use a Nitro middleware to upgrade connections?
    // Or hooks: 'render:response'? No.

    // Since this is a "best feature" request, I will try to implement a robust WS solution.
    // Using `nitroApp.hooks.hook('request', ...)` won't help with upgrade.

    // NOTE: In Nuxt 3/Nitro, `nitropack` supports websockets via `h3`.
    // But let's stick to a simple separate WS server on a different port or same port if we can access it.
    // Since we can't easily access the main HTTP server in a generic way in Nitro presets (unless using specific preset),
    // we'll try to use the experimental websocket feature or just start a WS server on a separate port for simplicity,
    // OR (better) use standard Nuxt server API endpoint to handle upgrade.

    // BUT: standard node `ws` can attach to a server.
    // Let's try to access the node server via global context if available or use a workaround.

    // Workaround: We can't easily hook into the server listen event from a plugin in a platform-agnostic way.
    // But for a "Docker" / "Local" deployment (which is the target), we can perhaps just start a WS server on a dedicated port.
    // Let's use port 3001 for WebSocket for now, or share port if possible.

    // Actually, Nuxt 3 has `server/api/...` which are handled by H3.
    // We can creating a specific route `/api/ws` and handle upgrade there.

    // Let's try starting a standalone WS server on port 3001.
    const WS_PORT = 3001;
    let wss: WebSocketServer;

    try {
        wss = new WebSocketServer({ port: WS_PORT });
        console.log(`WebSocket server started on port ${WS_PORT}`);
    } catch (e) {
        console.warn('Could not start WebSocket server:', e);
        return;
    }

    const amuleClient = getAmuleClient();

    // Broadcast function
    const broadcast = (data: any) => {
        const message = JSON.stringify(data);
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    };

    // Poll status every 2 seconds
    setInterval(async () => {
        if (wss.clients.size > 0) {
            try {
                const status = await amuleClient.status();
                const downloads = await amuleClient.getDownloads();

                broadcast({
                    type: 'status_update',
                    data: {
                        status,
                        downloads
                    }
                });
            } catch (e) {
                // console.error('Error polling status:', e);
            }
        }
    }, 2000);

    wss.on('connection', (ws) => {
        // console.log('Client connected to WebSocket');

        ws.on('message', async (message) => {
             // Handle incoming messages if needed
             // For now, we mainly push updates
        });

        // Send immediate update
        (async () => {
             try {
                const status = await amuleClient.status();
                ws.send(JSON.stringify({ type: 'status_update', data: { status, downloads: [] } }));
             } catch (e) {}
        })();
    });

    nitroApp.hooks.hook('close', () => {
        wss.close();
    });
});
