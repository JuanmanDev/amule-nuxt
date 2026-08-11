/**
 * Picking several rows out of a list, and acting on all of them at once.
 *
 * Shared by the downloads, uploads and shared-file pages, because the awkward
 * parts are the same everywhere and none of them are about what the rows *are*:
 *
 *  * **Selection is off until asked for.** A list where every row is a checkbox
 *    makes the ordinary case - click a row, read it - worse. So there is a mode,
 *    and leaving it clears the selection.
 *  * **Keys, not objects.** The rows are replaced on every poll (see
 *    `mergeCollections`), so holding the objects would leave a selection of stale
 *    copies that no longer match anything in the list.
 *  * **A row that disappears leaves the selection.** Downloads finish and shared
 *    files come and go on their own; a selection that still counted them would
 *    act on hashes the daemon no longer has.
 *  * **"All" means all that match**, not all on this page. Anything else is a
 *    trap: selecting 100 of 3,000 filtered rows and pressing Remove should not
 *    depend on which page happened to be open.
 */

// Imported explicitly rather than relying on Nuxt's auto-imports: this is the one
// composable here with no Nuxt dependency at all, which makes it testable on its
// own - and the tests are where the list-changes-underneath cases are pinned down.
import { computed, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue';

export interface ListSelection<T> {
    /** True while the list is in selection mode. */
    active: Ref<boolean>;
    /** Keys currently ticked, in no particular order. */
    keys: Ref<string[]>;
    /** The rows those keys still refer to, in list order. */
    items: ComputedRef<T[]>;
    count: ComputedRef<number>;
    /** True when every selectable row is ticked. */
    all: ComputedRef<boolean>;
    /** True when some but not all are ticked, for the header checkbox. */
    some: ComputedRef<boolean>;
    has: (key: string) => boolean;
    toggle: (key: string, selected?: boolean) => void;
    /** Ticks everything that matches the current filter, or clears it. */
    toggleAll: (selected?: boolean) => void;
    clear: () => void;
    /** Enters selection mode. */
    start: () => void;
    /** Leaves selection mode and forgets the selection. */
    stop: () => void;
}

export interface ListSelectionOptions<T> {
    /**
     * Everything the user could select: the filtered and sorted list, *not* the
     * current page.
     */
    items: MaybeRefOrGetter<readonly T[]>;
    /** Stable identity of a row; the same key the list renders with. */
    keyOf: (item: T) => string;
}

export function useListSelection<T>(options: ListSelectionOptions<T>): ListSelection<T> {
    const active = ref(false);
    const keys = ref<string[]>([]);

    const all = computed(() => toValue(options.items));

    /** Fast membership tests for the per-row checkboxes. */
    const selectedKeys = computed(() => new Set(keys.value));

    const items = computed(() => all.value.filter(item => selectedKeys.value.has(options.keyOf(item))));

    // A selection that outlives its rows would act on things that are gone
    watch(all, list => {
        if (keys.value.length === 0) return;

        const present = new Set(list.map(options.keyOf));
        const kept = keys.value.filter(key => present.has(key));

        if (kept.length !== keys.value.length) keys.value = kept;
    });

    function toggle(key: string, selected?: boolean) {
        const shouldSelect = selected ?? !selectedKeys.value.has(key);

        keys.value = shouldSelect
            ? [...keys.value, key]
            : keys.value.filter(entry => entry !== key);
    }

    function toggleAll(selected?: boolean) {
        const shouldSelect = selected ?? !(items.value.length === all.value.length && all.value.length > 0);
        keys.value = shouldSelect ? all.value.map(options.keyOf) : [];
    }

    function clear() {
        keys.value = [];
    }

    return {
        active,
        keys,
        items,
        count: computed(() => items.value.length),
        all: computed(() => all.value.length > 0 && items.value.length === all.value.length),
        some: computed(() => items.value.length > 0 && items.value.length < all.value.length),
        has: (key: string) => selectedKeys.value.has(key),
        toggle,
        toggleAll,
        clear,
        start: () => { active.value = true; },
        stop: () => {
            active.value = false;
            keys.value = [];
        }
    };
}
