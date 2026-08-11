/**
 * Dates and durations, rendered only once the browser is in charge.
 *
 * A timestamp formatted during SSR is formatted in the *server's* timezone and
 * with the server's ICU data; the browser then formats the same number its own
 * way, and Vue finds a hydration mismatch. That is not a cosmetic warning here:
 * when the mismatched node is a bare text node, Vue's own mismatch reporting
 * throws (`el.hasAttribute is not a function`) and hydration of that subtree
 * dies with it.
 *
 * So nothing time-shaped is rendered until after mount. The first client render
 * matches the server's markup exactly - both show the placeholder - and the real
 * value appears a tick later, which for a timestamp nobody is watching is
 * invisible.
 */

import { formatDateTime, formatDuration } from '#shared/utils/datetime';

export const useLocalTime = () => {
    const { locale } = useI18n();
    const ready = ref(false);

    onMounted(() => { ready.value = true; });

    return {
        ready,

        /** An absolute date and time, or a dash until the browser can format it. */
        dateTime(epochMs: number | undefined | null): string {
            if (!ready.value) return '-';
            return formatDateTime(epochMs, locale.value) ?? '-';
        },

        /** A duration between two timestamps, or an empty string. */
        duration(fromMs: number | undefined | null, toMs: number | undefined | null): string {
            if (!ready.value) return '';
            return formatDuration(fromMs, toMs) ?? '';
        },

        /** A time of day, used for "results read at 14:12". */
        timeOfDay(epochMs: number | undefined | null): string {
            if (!ready.value || !epochMs) return '-';
            return new Date(epochMs).toLocaleTimeString(locale.value);
        }
    };
};
