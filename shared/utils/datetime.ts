/**
 * Dates the way this app needs to talk about them.
 *
 * Two rules, both about not overstating what is known:
 *
 *  * A timestamp that was never recorded prints as a dash, not as 1970 and not
 *    as "now".
 *  * A duration is rounded to something a person would say out loud. "3d 4h" is
 *    what a download taking three and a bit days deserves; "76h 12m 9s" is not.
 */

/** Formats an epoch-ms timestamp, or returns null when there is nothing to show. */
export function formatDateTime(epochMs: number | undefined | null, locale?: string): string | null {
    const value = Number(epochMs);
    if (!Number.isFinite(value) || value <= 0) return null;

    return new Date(value).toLocaleString(locale, {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
}

/**
 * How long something took, from two epoch-ms timestamps.
 *
 * Returns null unless both ends are known and the end is not before the start,
 * because a negative duration means the clock moved, not that a download went
 * backwards.
 */
export function formatDuration(fromMs: number | undefined | null, toMs: number | undefined | null): string | null {
    const from = Number(fromMs);
    const to = Number(toMs);

    if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to < from) return null;

    const seconds = Math.round((to - from) / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${Math.max(1, seconds)}s`;
}
