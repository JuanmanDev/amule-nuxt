/**
 * Registers this app as the handler for ed2k: and magnet: links, so clicking a
 * link anywhere on the device opens it here.
 *
 * Browsers only allow registerProtocolHandler for safelisted schemes (ed2k and
 * magnet both are), on a secure origin (https, or http on localhost), and only
 * from a user gesture. There is no API to query whether a handler is already
 * registered, so the choice is remembered locally to give useful feedback.
 */

const STORAGE_KEY = 'amule-nuxt:protocol-handlers';

export type HandledScheme = 'ed2k' | 'magnet';

export const useLinkHandler = () => {
    const toast = useToast();

    const registered = useState<HandledScheme[]>('amule-protocol-handlers', () => []);

    /**
     * registerProtocolHandler needs a secure context; localhost counts as one.
     * Determined after mount so the server and the client render the same markup
     * first - deciding it during setup produced a hydration mismatch.
     */
    const isSupported = ref(false);

    const handlerUrl = (scheme: HandledScheme) =>
        import.meta.client ? `${window.location.origin}/handle-link?link=%s&scheme=${scheme}` : '';

    function loadRemembered() {
        if (!import.meta.client) return;
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
            if (Array.isArray(stored)) registered.value = stored;
        } catch {
            registered.value = [];
        }
    }

    function remember(scheme: HandledScheme) {
        if (!registered.value.includes(scheme)) {
            registered.value = [...registered.value, scheme];
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(registered.value));
    }

    function register(scheme: HandledScheme) {
        if (!isSupported.value) {
            toast.add({
                title: 'Not supported here',
                description: window.isSecureContext
                    ? 'This browser cannot register protocol handlers.'
                    : 'Protocol handlers need https (or localhost). Serve the app over https and try again.',
                color: 'warning'
            });
            return;
        }

        try {
            // The third title argument is obsolete but still accepted by older browsers
            (navigator.registerProtocolHandler as (
                scheme: string,
                url: string,
                title?: string
            ) => void)(scheme, handlerUrl(scheme), `aMule Nuxt (${scheme})`);
            remember(scheme);
            toast.add({
                title: `${scheme}: links will open here`,
                description: 'The browser may ask you to confirm the new handler.',
                color: 'success'
            });
        } catch (error: any) {
            toast.add({
                title: `Could not register ${scheme}: links`,
                description: error?.message ?? 'The browser refused the request.',
                color: 'error'
            });
        }
    }

    /** There is no unregister API; point the user at the browser settings. */
    function forget(scheme: HandledScheme) {
        registered.value = registered.value.filter(entry => entry !== scheme);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(registered.value));
        toast.add({
            title: 'Removed from this app',
            description: 'Remove the handler itself in the browser settings, under handlers or applications.',
            color: 'info'
        });
    }

    onMounted(() => {
        isSupported.value = typeof navigator?.registerProtocolHandler === 'function' && window.isSecureContext;
        loadRemembered();
    });

    return { isSupported, registered, register, forget, handlerUrl };
};
