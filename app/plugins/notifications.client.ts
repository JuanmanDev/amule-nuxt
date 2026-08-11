/**
 * Turns queue events pushed by the server into something the user sees.
 *
 * It lives in a plugin so it works on every page, and so a download added from
 * another machine is announced while the user is looking at, say, the statistics.
 *
 * Two outputs per event:
 *
 *  * a toast with a button to the queue, always;
 *  * an operating-system notification, only when this tab is not the one being
 *    looked at. Showing an OS notification for something already on screen is
 *    noise, and the service worker uses the same rule for push so the two layers
 *    cannot both fire.
 */

import type { DownloadEvent } from '../../server/utils/downloadEvents';

/** Bytes -> "1.5 GB", short enough for a notification body. */
function shortSize(bytes: number): string {
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

export default defineNuxtPlugin(nuxtApp => {
    const { downloadEvents } = useAmuleSocket();
    const notifications = useNotifications();
    const toast = useToast();
    const router = useRouter();
    const { t } = useNuxtApp().$i18n as { t: (key: string) => string };

    // After the app has hydrated, never before: reading the stored preferences and
    // the permission state changes what the settings page renders, and doing it
    // while the server-rendered markup is still being adopted makes Vue patch over
    // a page it was told matched.
    nuxtApp.hook('app:mounted', () => notifications.hydrate());

    watch(downloadEvents, events => {
        for (const event of events as DownloadEvent[]) {
            if (!notifications.wants(event)) continue;

            const completed = event.kind === 'completed';
            const size = shortSize(event.size);
            const title = completed ? 'Download completed' : 'Download added';
            const description = size ? `${event.name} (${size})` : event.name;

            toast.add({
                title,
                description,
                color: completed ? 'success' : 'info',
                icon: completed ? 'i-heroicons-check-circle' : 'i-heroicons-arrow-down-tray',
                duration: 8000,
                actions: [{
                    label: t('common.goToDownloads'),
                    color: 'neutral',
                    variant: 'outline',
                    // `to` rather than a click handler: the action renders as a real
                    // link, so it navigates even though clicking it also dismisses
                    // the toast the handler would have belonged to.
                    to: '/downloads'
                }]
            });

            const canNotify = notifications.preferences.value.system
                && typeof Notification !== 'undefined'
                && Notification.permission === 'granted'
                && document.visibilityState !== 'visible';

            if (!canNotify) continue;

            try {
                const notification = new Notification(title, {
                    body: description,
                    // One notification per file, so an add followed by a completion
                    // replaces its own entry instead of stacking two
                    tag: `download-${event.hash}`,
                    icon: '/favicon.ico'
                });

                notification.onclick = () => {
                    notification.close();
                    window.focus();

                    // The router is the fast path; a full navigation is the
                    // fallback, because a click arriving in a backgrounded tab has
                    // been seen to run before the router is ready to handle it.
                    router.push('/downloads').catch(() => {
                        window.location.assign('/downloads');
                    });
                };
            } catch {
                // Some browsers refuse the constructor outside a service worker;
                // the toast has already done the job.
            }
        }
    });
});
