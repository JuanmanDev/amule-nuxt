/*
 * Service worker for download notifications.
 *
 * Deliberately tiny: it does not cache anything and does not touch fetch. This
 * app talks to a daemon on the local network and its data is stale the second it
 * is stored, so an offline cache would only ever serve numbers that are wrong.
 * The worker exists for one reason - a push message can only be received by one.
 *
 * Browsers only register a service worker over HTTPS, with localhost as the
 * exemption. Where that is not available the app falls back to notifications
 * raised by the page itself, which need a tab to be open.
 */

// A new version takes over immediately rather than waiting for every tab to be
// closed, so a fix to this file is never a session behind.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

/** True when any tab of this app is on screen right now. */
async function appIsVisible() {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    return clients.some(client => client.visibilityState === 'visible');
}

self.addEventListener('push', event => {
    event.waitUntil((async () => {
        let payload = {};
        try {
            payload = event.data ? event.data.json() : {};
        } catch {
            payload = { title: 'aMule', body: event.data ? event.data.text() : '' };
        }

        // The page raises its own notification when it is being looked at, and two
        // notifications for one download is worse than none.
        if (await appIsVisible()) return;

        const title = payload.title || 'aMule';
        await self.registration.showNotification(title, {
            body: payload.body || '',
            tag: payload.tag || 'amule',
            // Replaces a notification with the same tag rather than re-alerting
            renotify: false,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            data: { url: payload.url || '/downloads', kind: payload.kind || '' },
            actions: [{ action: 'open', title: 'Open downloads' }]
        });
    })());
});

self.addEventListener('notificationclick', event => {
    event.notification.close();

    const target = (event.notification.data && event.notification.data.url) || '/downloads';

    event.waitUntil((async () => {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

        // Reuse a tab that is already open on this app instead of opening another
        for (const client of clients) {
            if (new URL(client.url).origin !== self.location.origin) continue;

            try {
                await client.focus();
            } catch {
                // A window that refuses focus can still be navigated
            }

            /*
             * navigate() only works on a client this worker controls. A tab that
             * was already open when the worker was first installed is not
             * controlled until it reloads, and there navigate() rejects - which
             * is why clicking a notification used to focus the app and then do
             * nothing at all. Falling through to openWindow always gets there.
             */
            try {
                if ('navigate' in client) {
                    await client.navigate(target);
                    return;
                }
            } catch {
                // Not controlled: open a window instead
            }

            break;
        }

        await self.clients.openWindow(target);
    })());
});
