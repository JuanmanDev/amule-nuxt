/**
 * Being told when a download is added or finishes — including when it was not
 * this browser that added it.
 *
 * Two layers, because one of them cannot cover the whole case:
 *
 *  * **In-page.** The server reports queue events over the live socket; any open
 *    tab shows a toast with a link to the queue and, if the tab is not the one
 *    being looked at, an operating-system notification. No permission needed for
 *    the toast, no HTTPS needed for either.
 *  * **Push.** A service worker subscribed to this server receives the same
 *    events with no tab open at all. This needs notification permission and a
 *    secure context (HTTPS, or localhost), which is why it is offered rather than
 *    assumed.
 *
 * Preferences live in `localStorage`: they are about this browser, not about the
 * daemon, and two people using the same instance should not fight over them.
 */

import type { DownloadEvent } from '../../server/utils/downloadEvents';

export interface NotificationPreferences {
    /** Notify when something joins the queue, wherever it was added from. */
    added: boolean;
    /** Notify when a download finishes. */
    completed: boolean;
    /** Also raise an OS notification, not only an in-app toast. */
    system: boolean;
}

const STORAGE_KEY = 'amule.notifications';

const DEFAULTS: NotificationPreferences = {
    added: true,
    completed: true,
    system: true
};

function readPreferences(): NotificationPreferences {
    if (import.meta.server) return { ...DEFAULTS };

    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : { ...DEFAULTS };
    } catch {
        return { ...DEFAULTS };
    }
}

export const useNotifications = () => {
    const preferences = useState<NotificationPreferences>('amule-notification-prefs', () => ({ ...DEFAULTS }));
    /** 'default' means the browser has not been asked yet. */
    const permission = useState<NotificationPermission | 'unsupported'>('amule-notification-permission', () => 'default');
    const pushEndpoint = useState<string | null>('amule-push-endpoint', () => null);
    const pushBusy = useState<boolean>('amule-push-busy', () => false);

    /**
     * Service workers, and therefore push, are only available in a secure
     * context. A LAN address over plain HTTP is the common case here, so this is
     * a normal state to be in rather than an error.
     *
     * Answered after mount, like `useLinkHandler` does for the same reason:
     * deciding it during setup makes the client's first render disagree with the
     * server's markup, and Vue reports the whole page as a hydration mismatch.
     */
    const pushSupported = useState<boolean>('amule-push-supported', () => false);
    /** False until the browser has been asked what it can do, so nothing is claimed too early. */
    const checked = useState<boolean>('amule-push-checked', () => false);

    const pushEnabled = computed(() => Boolean(pushEndpoint.value));

    function save() {
        if (import.meta.server) return;
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences.value));
        } catch {
            // A browser that refuses storage still gets the current session's setting
        }
    }

    /** Reads what this browser already decided; safe to call more than once. */
    async function hydrate() {
        if (import.meta.server) return;

        preferences.value = readPreferences();
        permission.value = 'Notification' in window ? Notification.permission : 'unsupported';
        pushSupported.value = 'serviceWorker' in navigator
            && 'PushManager' in window
            && window.isSecureContext;
        checked.value = true;

        if (!pushSupported.value) return;

        // An existing subscription survives restarts, so the UI has to reflect it
        // rather than offering to subscribe again.
        const registration = await navigator.serviceWorker.getRegistration('/sw.js');
        const subscription = await registration?.pushManager.getSubscription();
        pushEndpoint.value = subscription?.endpoint ?? null;
    }

    async function requestPermission(): Promise<boolean> {
        if (import.meta.server || !('Notification' in window)) return false;

        const result = await Notification.requestPermission();
        permission.value = result;
        return result === 'granted';
    }

    /**
     * VAPID keys travel as base64url and `applicationServerKey` wants bytes.
     *
     * The buffer is allocated first and typed as an `ArrayBuffer`: a plain
     * `Uint8Array` is backed by `ArrayBufferLike`, which the DOM types do not
     * accept here since they have to rule out a `SharedArrayBuffer`.
     */
    function decodeKey(base64: string): ArrayBuffer {
        const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const raw = window.atob(padded);

        const buffer = new ArrayBuffer(raw.length);
        const bytes = new Uint8Array(buffer);
        for (let index = 0; index < raw.length; index += 1) {
            bytes[index] = raw.charCodeAt(index);
        }

        return buffer;
    }

    /**
     * Registers the worker, subscribes it, and hands the subscription to the
     * server. Every step can fail on its own, so the reason comes back as a
     * string rather than a boolean.
     */
    async function enablePush(): Promise<{ ok: boolean; error?: string }> {
        if (!pushSupported.value) {
            return {
                ok: false,
                error: window.isSecureContext
                    ? 'This browser has no push support'
                    : 'Push notifications need HTTPS (or localhost). Over plain HTTP, notifications only work while a tab is open.'
            };
        }

        pushBusy.value = true;
        try {
            if (!(await requestPermission())) {
                return { ok: false, error: 'Notification permission was not granted' };
            }

            const registration = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;

            const keyResponse = await $fetch<{ success: boolean; data?: { publicKey: string }; error?: string }>('/api/push/vapid');
            if (!keyResponse.success || !keyResponse.data?.publicKey) {
                return { ok: false, error: keyResponse.error || 'The server has no push key' };
            }

            // Re-subscribing with a different key silently fails, so an existing
            // subscription from an earlier key has to go first.
            const existing = await registration.pushManager.getSubscription();
            if (existing) await existing.unsubscribe();

            const subscription = await registration.pushManager.subscribe({
                // Required by every browser: only push messages that show a
                // notification are allowed.
                userVisibleOnly: true,
                applicationServerKey: decodeKey(keyResponse.data.publicKey)
            });

            const json = subscription.toJSON();
            const response = await $fetch<{ success: boolean; error?: string }>('/api/push/subscribe', {
                method: 'POST',
                body: {
                    endpoint: subscription.endpoint,
                    keys: json.keys,
                    label: navigator.userAgent
                }
            });

            if (!response.success) {
                await subscription.unsubscribe();
                return { ok: false, error: response.error || 'The server refused the subscription' };
            }

            pushEndpoint.value = subscription.endpoint;
            return { ok: true };
        } catch (e: any) {
            return { ok: false, error: e?.message || 'Could not subscribe to push notifications' };
        } finally {
            pushBusy.value = false;
        }
    }

    async function disablePush(): Promise<void> {
        pushBusy.value = true;
        try {
            const registration = await navigator.serviceWorker.getRegistration('/sw.js');
            const subscription = await registration?.pushManager.getSubscription();

            if (subscription) {
                // Told to the server first: a subscription the browser has already
                // dropped can no longer be identified reliably.
                await $fetch('/api/push/unsubscribe', {
                    method: 'POST',
                    body: { endpoint: subscription.endpoint }
                }).catch(() => undefined);
                await subscription.unsubscribe();
            }

            pushEndpoint.value = null;
        } finally {
            pushBusy.value = false;
        }
    }

    /** True when this event is one the user asked to hear about. */
    function wants(event: DownloadEvent): boolean {
        return event.kind === 'completed' ? preferences.value.completed : preferences.value.added;
    }

    function setPreference<K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) {
        preferences.value = { ...preferences.value, [key]: value };
        save();
    }

    return {
        preferences,
        permission,
        checked,
        pushSupported,
        pushEnabled,
        pushBusy,
        hydrate,
        requestPermission,
        enablePush,
        disablePush,
        setPreference,
        wants
    };
};
