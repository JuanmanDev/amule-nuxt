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

/** The name a download's row carries on every page that lists it. */
export function downloadTransitionName(hash: string): string {
    return `dl-${hash}`;
}

/** The one name shared by a row and the modal title it turns into. */
export const ACTIVE_TRANSITION_NAME = 'dl-active';
