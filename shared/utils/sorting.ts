/**
 * Sorting shared by every list page, so ordering behaves identically
 * everywhere: same option shape, same direction handling, same tie break.
 */

export type SortDirection = 'asc' | 'desc';

export interface SortOption<TKey extends string = string> {
    /** Stable key stored in the page state. */
    value: TKey;
    /** Shown in the sort menu. */
    label: string;
    /** Direction applied when the user picks this option. */
    defaultDirection?: SortDirection;
}

/** Compares two values of the same field, numbers and strings alike. */
function compareValues(a: unknown, b: unknown): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Sorts a copy of `items` by the value each item yields for `key`.
 * `desc` reverses the comparison, so every option supports both directions.
 */
export function sortItems<T>(
    items: readonly T[],
    key: string,
    direction: SortDirection,
    accessors: Record<string, (item: T) => unknown>
): T[] {
    const accessor = accessors[key];
    if (!accessor) return [...items];

    const factor = direction === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => compareValues(accessor(a), accessor(b)) * factor);
}

/** Case-insensitive "contains" filter over the given fields. */
export function filterItems<T>(items: readonly T[], query: string, fields: (item: T) => Array<string | number | undefined>): T[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [...items];

    return items.filter(item => fields(item).some(field => String(field ?? '').toLowerCase().includes(needle)));
}
