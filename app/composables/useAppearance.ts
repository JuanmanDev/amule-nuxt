/**
 * Look-and-feel switches that trade fidelity for frame rate.
 *
 * The activity background and the frosted panels are the two things on this app
 * that cost real GPU time: a full screen animated layer, and a `backdrop-filter`
 * on every card that has to be recomputed whenever anything behind it moves. Both
 * are opt-in levers here rather than hard-coded, so a weak machine (or a laptop on
 * battery) can turn them down without losing the app.
 *
 * The choice lives in a cookie rather than in localStorage so the server renders
 * the same markup the client hydrates: reading it during SSR is what keeps the
 * background from flashing in and then disappearing on the first paint.
 */

/** `off` renders nothing, `static` keeps the tint, `animated` adds the shapes. */
export type BackgroundMode = 'off' | 'static' | 'animated';

export interface AppearanceSettings {
    background: BackgroundMode;
    /** Frosted panels: `backdrop-filter` on cards, rows, modals and toasts. */
    glass: boolean;
}

const BACKGROUND_MODES: BackgroundMode[] = ['off', 'static', 'animated'];

/**
 * Static by default: the tint costs one composited layer and an opacity change
 * per poll, while the drifting shapes animate continuously for as long as the tab
 * is open. Anyone who wants them can switch to `animated` in Settings.
 */
export const DEFAULT_APPEARANCE: AppearanceSettings = { background: 'static', glass: true };

/** A year: this is a preference, not a session detail. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const BACKGROUND_MODE_OPTIONS: { value: BackgroundMode; label: string; description: string }[] = [
    { value: 'off', label: 'Off', description: 'Nothing is drawn behind the pages. Cheapest.' },
    { value: 'static', label: 'Tint only', description: 'A soft glow that follows the transfer rates, without motion.' },
    { value: 'animated', label: 'Full animation', description: 'Adds drifting shapes, one per transferring file. Costs the most GPU.' }
];

export function useAppearance() {
    const cookie = useCookie<AppearanceSettings>('amule-appearance', {
        default: () => ({ ...DEFAULT_APPEARANCE }),
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE
    });

    /** A hand-edited or stale cookie must not be able to break the layout. */
    const background = computed<BackgroundMode>({
        get: () => BACKGROUND_MODES.includes(cookie.value?.background as BackgroundMode)
            ? cookie.value.background
            : DEFAULT_APPEARANCE.background,
        set: value => {
            cookie.value = { ...DEFAULT_APPEARANCE, ...cookie.value, background: value };
        }
    });

    const glass = computed<boolean>({
        get: () => cookie.value?.glass ?? DEFAULT_APPEARANCE.glass,
        set: value => {
            cookie.value = { ...DEFAULT_APPEARANCE, ...cookie.value, glass: value };
        }
    });

    return { background, glass };
}

/**
 * Tracks `prefers-reduced-motion`.
 *
 * Starts at false and only reads the media query once mounted: the server cannot
 * know the answer, so assuming motion is allowed keeps the first client render
 * identical to the SSR markup.
 */
export function usePrefersReducedMotion() {
    const reduced = ref(false);

    onMounted(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        reduced.value = query.matches;

        const onChange = (event: MediaQueryListEvent) => {
            reduced.value = event.matches;
        };
        query.addEventListener('change', onChange);
        onScopeDispose(() => query.removeEventListener('change', onChange));
    });

    return reduced;
}
