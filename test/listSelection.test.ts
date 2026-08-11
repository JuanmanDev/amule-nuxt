import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import { useListSelection } from '../app/composables/useListSelection';

interface Row { hash: string; name: string }

const row = (hash: string): Row => ({ hash, name: `${hash}.bin` });

/**
 * The awkward parts of a selection are all about the list changing underneath
 * it - which is exactly what these lists do, every couple of seconds.
 */
describe('useListSelection', () => {
    it('starts inactive and empty', () => {
        const items = ref([row('a'), row('b')]);
        const selection = useListSelection<Row>({ items, keyOf: item => item.hash });

        expect(selection.active.value).toBe(false);
        expect(selection.count.value).toBe(0);
    });

    it('toggles one row on and off', () => {
        const items = ref([row('a'), row('b')]);
        const selection = useListSelection<Row>({ items, keyOf: item => item.hash });

        selection.toggle('a');
        expect(selection.has('a')).toBe(true);
        expect(selection.count.value).toBe(1);

        selection.toggle('a');
        expect(selection.has('a')).toBe(false);
    });

    it('returns the rows in list order, not the order they were picked', () => {
        const items = ref([row('a'), row('b'), row('c')]);
        const selection = useListSelection<Row>({ items, keyOf: item => item.hash });

        selection.toggle('c');
        selection.toggle('a');

        expect(selection.items.value.map(item => item.hash)).toEqual(['a', 'c']);
    });

    it('selects everything that matches, then clears', () => {
        const items = ref([row('a'), row('b'), row('c')]);
        const selection = useListSelection<Row>({ items, keyOf: item => item.hash });

        selection.toggleAll();
        expect(selection.count.value).toBe(3);
        expect(selection.all.value).toBe(true);
        expect(selection.some.value).toBe(false);

        selection.toggleAll();
        expect(selection.count.value).toBe(0);
    });

    it('reports a partial selection as neither all nor none', () => {
        const items = ref([row('a'), row('b')]);
        const selection = useListSelection<Row>({ items, keyOf: item => item.hash });

        selection.toggle('a');
        expect(selection.all.value).toBe(false);
        expect(selection.some.value).toBe(true);
    });

    it('drops a row that leaves the list', async () => {
        // Downloads finish and shared files come and go; acting on a hash the
        // daemon no longer has would fail one request per stale row
        const items = ref([row('a'), row('b')]);
        const selection = useListSelection<Row>({ items, keyOf: item => item.hash });

        selection.toggleAll();
        expect(selection.count.value).toBe(2);

        items.value = [row('a')];
        await nextTick();

        expect(selection.keys.value).toEqual(['a']);
        expect(selection.count.value).toBe(1);
    });

    it('keeps the selection when the list is merely re-read', async () => {
        const items = ref([row('a'), row('b')]);
        const selection = useListSelection<Row>({ items, keyOf: item => item.hash });

        selection.toggle('b');
        // A poll replaces the objects, keeping the same keys
        items.value = [row('a'), row('b')];
        await nextTick();

        expect(selection.has('b')).toBe(true);
    });

    it('follows the filter: "all" means all that match', () => {
        const items = ref([row('a'), row('b'), row('c')]);
        const selection = useListSelection<Row>({ items, keyOf: item => item.hash });

        // The page hands it the filtered list, so narrowing the filter narrows
        // what "all" covers
        items.value = [row('b')];
        selection.toggleAll();

        expect(selection.keys.value).toEqual(['b']);
    });

    it('forgets everything when selection mode ends', () => {
        const items = ref([row('a')]);
        const selection = useListSelection<Row>({ items, keyOf: item => item.hash });

        selection.start();
        selection.toggle('a');
        selection.stop();

        expect(selection.active.value).toBe(false);
        expect(selection.count.value).toBe(0);
    });

    it('treats an empty list as "not all selected"', () => {
        const items = ref<Row[]>([]);
        const selection = useListSelection<Row>({ items, keyOf: item => item.hash });

        // Otherwise the header checkbox reads as ticked on an empty list
        expect(selection.all.value).toBe(false);
        selection.toggleAll();
        expect(selection.count.value).toBe(0);
    });
});
