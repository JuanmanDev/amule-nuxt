/**
 * Merges a freshly read collection into the one already on screen.
 *
 * Every poll used to replace the whole array, so every row was a new object with
 * a new position: `<TransitionGroup>` saw the list it had been given leave and a
 * brand new one enter, and the queue blinked once per interval even when nothing
 * about it had changed. Two live sources made it worse — a WebSocket push and an
 * HTTP poll alternating, each replacing the other's array.
 *
 * So the merge is by key, and it is deliberately conservative:
 *
 *  * a row whose fields are unchanged keeps its **exact object**, so components
 *    bound to it do not re-render;
 *  * rows keep the order they already had, and genuinely new ones are appended,
 *    so a re-ordering upstream cannot shuffle the list under the user;
 *  * if nothing at all changed the **previous array itself** is returned, which
 *    means the `ref` holding it never even fires.
 *
 * That last point is what makes a poll free: no reactive effect runs, no list
 * transition starts, nothing moves.
 */

/** Same own keys, same values by `Object.is`. Deep structures are compared by reference. */
function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every(key => Object.is(a[key], b[key]));
}

/**
 * Keys are not guaranteed unique — an upload has no natural id, and aMule can
 * report the same file twice for two peers. Numbering the repeats keeps every
 * entry addressable instead of collapsing them into one.
 */
function indexByKey<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T> {
    const map = new Map<string, T>();
    const seen = new Map<string, number>();

    for (const item of items) {
        const base = keyOf(item);
        const repeat = seen.get(base) ?? 0;
        seen.set(base, repeat + 1);
        map.set(repeat === 0 ? base : `${base}#${repeat}`, item);
    }

    return map;
}

export function mergeCollections<T extends object>(
    previous: readonly T[],
    next: readonly T[],
    keyOf: (item: T) => string
): T[] {
    if (previous.length === 0) return next as T[];

    const incoming = indexByKey(next, keyOf);
    const existing = indexByKey(previous, keyOf);

    const merged: T[] = [];

    // Everything that survived, in the order it is already displayed in
    for (const [key, item] of existing) {
        const fresh = incoming.get(key);
        if (!fresh) continue;
        merged.push(
            shallowEqual(item as Record<string, unknown>, fresh as Record<string, unknown>)
                ? item
                : fresh
        );
    }

    // Then the arrivals, in the order the daemon reported them
    for (const [key, item] of incoming) {
        if (!existing.has(key)) merged.push(item);
    }

    const unchanged = merged.length === previous.length
        && merged.every((item, index) => item === previous[index]);

    return unchanged ? (previous as T[]) : merged;
}
