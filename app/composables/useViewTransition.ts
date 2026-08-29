/**
 * Shared-element transitions, built on the View Transitions API.
 *
 * Two places use it: navigating from the dashboard's queue summary to the
 * download page (each row carries `view-transition-name: dl-<hash>` on both
 * pages, so the browser moves the row rather than fading the page), and
 * opening a download's details, where the row's title becomes the modal's.
 *
 * Page navigations are handled by Nuxt (`experimental.viewTransition`); this
 * file is for the in-page case and for the naming helpers. Browsers without the
 * API - Firefox, at the time of writing - fall back to the plain change, and the
 * Vue page transition in app.vue stays on for them.
 */

export type ViewTransitionKind = 'modal';

export function supportsViewTransition(): boolean {
    return import.meta.client
        && typeof document !== 'undefined'
        && 'startViewTransition' in document
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Runs `update` inside a view transition, tagging the document with the kind
 * so the stylesheet can pick a different root animation (a modal fades where a
 * page slides). Resolves when the animation is over - or at once, without one.
 */
export async function withViewTransition(kind: ViewTransitionKind, update: () => void | Promise<void>): Promise<void> {
    if (!supportsViewTransition()) {
        await update();
        await nextTick();
        return;
    }

    document.documentElement.dataset.vt = kind;
    const transition = (document as any).startViewTransition(async () => {
        await update();
        await nextTick();
    });

    try {
        await transition.finished;
    } catch {
        // Skipped or interrupted: the DOM is already in its new state
    } finally {
        delete document.documentElement.dataset.vt;
    }
}

/** The one name shared by a row and the modal title it turns into. */
export const ACTIVE_TRANSITION_NAME = 'dl-active';

/**
 * A safe `view-transition-name` for any key: the API wants a CSS identifier,
 * and an upload's key is `hash@ip:port`.
 */
export function transitionNameFor(prefix: string, key: string): string {
    return `${prefix}-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/**
 * The row-becomes-modal choreography, shared by the download, upload and
 * shared-file pages.
 *
 * Before the transition the clicked row carries the modal title's name; after
 * it the title does and the row is unnamed, so nothing is left fading where the
 * row still stands. `rowName` is what each row should render, `shared` is what
 * the modal's `shared` prop wants, and `open`/`close` wrap the state changes.
 */
export function useDetailsTransition() {
    const sharedKey = ref<string | null>(null);
    const modalHolds = ref(false);
    const shared = computed(() => sharedKey.value !== null);

    function rowName(key: string, prefix: string): string {
        if (key !== sharedKey.value) return transitionNameFor(prefix, key);
        return modalHolds.value ? 'none' : ACTIVE_TRANSITION_NAME;
    }

    async function open(key: string, apply: () => void): Promise<void> {
        if (!supportsViewTransition()) {
            apply();
            return;
        }
        sharedKey.value = key;
        await nextTick();
        await withViewTransition('modal', () => {
            apply();
            modalHolds.value = true;
        });
    }

    async function close(apply: () => void): Promise<void> {
        if (sharedKey.value === null) {
            apply();
            return;
        }
        await withViewTransition('modal', () => {
            apply();
            modalHolds.value = false;
        });
        sharedKey.value = null;
    }

    /** For a modal closed by something other than the user: the row vanished. */
    function reset(): void {
        sharedKey.value = null;
        modalHolds.value = false;
    }

    return { shared, rowName, open, close, reset };
}
