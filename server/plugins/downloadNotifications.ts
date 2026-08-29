/**
 * Starts the queue monitor and turns what it sees into push notifications.
 *
 * This is the half of the feature that works with no browser open: a download
 * added from another machine, from amuleGUI, or from a link handler somewhere
 * else shows up on the phone that subscribed, and so does one that finishes
 * overnight.
 *
 * Push is best-effort by design. No subscriptions, no HTTPS, a push service that
 * is down - none of it is allowed to affect the daemon or the app, so failures
 * are logged and dropped.
 */

import { onDownloadEvents, startMonitor, stopMonitor } from '../utils/amuleMonitor';
import { broadcastPush } from '../utils/webPush';
import { useLogger } from '../utils/logger';

const log = useLogger('notifications');

/** Bytes -> "1.5 GB", kept here so the server does not import a browser helper. */
function humanSize(bytes: number): string {
    if (!(bytes > 0)) return '';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }

    return `${unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export default defineNitroPlugin((nitroApp) => {
    // The prerenderer (nuxt generate) loads every plugin too: a socket server or
    // a polling timer started here would keep that process alive forever.
    if (import.meta.prerender) return;

    const stopEvents = onDownloadEvents(async events => {
        for (const event of events) {
            const size = humanSize(event.size);

            try {
                const result = await broadcastPush({
                    title: event.kind === 'completed' ? 'Download completed' : 'Download added',
                    body: size ? `${event.name} (${size})` : event.name,
                    url: '/downloads',
                    // One notification per file: a download that is added and then
                    // finishes replaces its own entry rather than stacking two.
                    tag: `download-${event.hash}`,
                    kind: event.kind
                });

                if (result.sent > 0) {
                    log.debug(`Pushed "${event.kind}" for ${event.name} to ${result.sent} subscriber(s)`);
                }
            } catch (e) {
                log.warn('Could not send a push notification', e);
            }
        }
    });

    startMonitor();

    nitroApp.hooks.hook('close', () => {
        stopEvents();
        stopMonitor();
    });
});
