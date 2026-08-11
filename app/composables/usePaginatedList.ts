/**
 * Filter, sort and page one list, the same way on every page.
 *
 * A busy daemon has thousands of shared files and hundreds of queued downloads,
 * and rendering all of them meant thousands of live components: every poll had to
 * diff the lot, every row carried a progress bar and a transition, and the page
 * got slower the more there was to look at. Pages of 100 keep the DOM a fixed
 * size no matter how big the list behind it is.
 *
 * The pieces the pages get:
 *
 *  * `search`, `sortBy`, `direction` - the same state `ListControls` already
 *    binds to, so nothing about filtering changes;
 *  * `visible` - the rows of the current page, filtered and sorted first, so
 *    paging never hides a match;
 *  * `page`, `pageSize` and the counts a pagination bar needs.
 *
 * The page number is derived state, not user state: anything that changes what
 * the list contains (a filter, a different sort, a different page size) sends the
 * user back to the first page, and a list that shrinks under a page pulls the
 * page back with it instead of showing an empty screen.
 */

import { filterItems, sortItems, type SortDirection } from '#shared/utils/sorting';

/** "All" is a page size too; kept out of band so the type stays numeric. */
export const ALL_ITEMS = Number.POSITIVE_INFINITY;

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500, ALL_ITEMS] as const;

export const DEFAULT_PAGE_SIZE = 100;

export interface PaginatedListOptions<T> {
    /** The full list, before filtering. */
    items: MaybeRefOrGetter<readonly T[]>;
    /** Fields the text filter looks at. */
    fields: (item: T) => Array<string | number | undefined>;
    /** One accessor per sort option, as `sortItems` expects. */
    accessors: Record<string, (item: T) => unknown>;
    /** Sort applied before the user picks one. */
    sortBy: string;
    direction?: SortDirection;
    /**
     * Remembers the chosen page size across visits and reloads under this name.
     * One name per list, so a long shared-file list and a short queue can be
     * paged differently.
     */
    storageKey?: string;
}

export interface PaginatedList<T> {
    search: Ref<string>;
    sortBy: Ref<string>;
    direction: Ref<SortDirection>;
    page: Ref<number>;
    pageSize: Ref<number>;
    /** Rows of the current page: filtered, sorted, then sliced. */
    visible: ComputedRef<T[]>;
    /**
     * Every row matching the filter, sorted but not paged.
     *
     * What "select all" has to mean: which page happens to be open must not
     * change what a bulk action applies to.
     */
    matching: ComputedRef<T[]>;
    /** How many rows match the filter, across every page. */
    matched: ComputedRef<number>;
    /** How many rows there are in total, ignoring the filter. */
    total: ComputedRef<number>;
    pageCount: ComputedRef<number>;
    /** 1-based index of the first and last row on screen, for "x-y of z". */
    firstOnPage: ComputedRef<number>;
    lastOnPage: ComputedRef<number>;
    /** True once there is more than one page, i.e. the pagination bar is useful. */
    paged: ComputedRef<boolean>;
    /** True when a filter is hiding rows. */
    filtered: ComputedRef<boolean>;
    /** Changes as the user moves between pages; see `AnimatedList`'s `reset-key`. */
    pageKey: ComputedRef<string>;
}

const STORAGE_PREFIX = 'amule.pageSize.';

function readStoredPageSize(storageKey: string | undefined): number {
    if (!storageKey || import.meta.server) return DEFAULT_PAGE_SIZE;

    try {
        const stored = window.localStorage.getItem(STORAGE_PREFIX + storageKey);
        if (stored === 'all') return ALL_ITEMS;

        const parsed = Number(stored);
        return PAGE_SIZE_OPTIONS.includes(parsed as any) ? parsed : DEFAULT_PAGE_SIZE;
    } catch {
        // Private mode and blocked storage both throw; the default is fine
        return DEFAULT_PAGE_SIZE;
    }
}

function storePageSize(storageKey: string | undefined, size: number): void {
    if (!storageKey || import.meta.server) return;

    try {
        window.localStorage.setItem(STORAGE_PREFIX + storageKey, size === ALL_ITEMS ? 'all' : String(size));
    } catch {
        // Not being able to remember the choice is not worth reporting
    }
}

export function usePaginatedList<T>(options: PaginatedListOptions<T>): PaginatedList<T> {
    const search = ref('');
    const sortBy = ref(options.sortBy);
    const direction = ref<SortDirection>(options.direction ?? 'desc');
    const page = ref(1);
    // Server-rendered markup has to match the first client render, so the stored
    // size is only read once the browser has taken over.
    const pageSize = ref(DEFAULT_PAGE_SIZE);

    onMounted(() => {
        const stored = readStoredPageSize(options.storageKey);
        if (stored !== pageSize.value) pageSize.value = stored;
    });

    const all = computed(() => toValue(options.items));

    const matching = computed(() => sortItems(
        filterItems(all.value, search.value, options.fields),
        sortBy.value,
        direction.value,
        options.accessors
    ));

    const pageCount = computed(() => Math.max(1, Math.ceil(matching.value.length / pageSize.value)));

    const visible = computed(() => {
        if (pageSize.value === ALL_ITEMS) return matching.value;

        const start = (page.value - 1) * pageSize.value;
        return matching.value.slice(start, start + pageSize.value);
    });

    // Anything that changes what is being listed starts again from the top: a
    // filter typed while on page 7 otherwise looks like it found nothing.
    watch([search, sortBy, direction], () => { page.value = 1; });

    watch(pageSize, size => {
        page.value = 1;
        storePageSize(options.storageKey, size);
    });

    // Downloads finish and shared files come and go on their own, so the list can
    // shrink out from under the page the user is on.
    watch(pageCount, count => {
        if (page.value > count) page.value = count;
    });

    const firstOnPage = computed(() => (matching.value.length === 0 ? 0 : (page.value - 1) * pageSize.value + 1));
    const lastOnPage = computed(() => Math.min(matching.value.length, page.value * pageSize.value));

    return {
        search,
        sortBy,
        direction,
        page,
        pageSize,
        visible,
        matching,
        matched: computed(() => matching.value.length),
        total: computed(() => all.value.length),
        pageCount,
        firstOnPage,
        lastOnPage,
        paged: computed(() => pageCount.value > 1),
        filtered: computed(() => matching.value.length !== all.value.length),
        pageKey: computed(() => `${page.value}:${pageSize.value}`)
    };
}
