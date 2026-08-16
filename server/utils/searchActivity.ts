/**
 * When a person last started a search by hand.
 *
 * The daemon holds exactly one search, so the automatic runner and a person
 * typing keywords are fighting over the same slot. The runner checks here and
 * waits its turn: a manual search is interactive and short-lived, an automatic
 * one has all day.
 */

/** How long after a manual search the automatic runner keeps its hands off. */
export const MANUAL_SEARCH_GRACE_MS = 3 * 60 * 1000;

let lastManualSearchAt = 0;

export function noteManualSearch(): void {
    lastManualSearchAt = Date.now();
}

export function manualSearchActive(now = Date.now()): boolean {
    return now - lastManualSearchAt < MANUAL_SEARCH_GRACE_MS;
}
