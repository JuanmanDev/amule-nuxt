import { describe, it, expect } from 'vitest';
import { mergeCollections } from '../shared/utils/mergeCollections';

interface Row { hash: string; name: string; speed: number }

const row = (hash: string, overrides: Partial<Row> = {}): Row => ({
    hash,
    name: `${hash}.bin`,
    speed: 0,
    ...overrides
});

const keyOf = (item: Row) => item.hash;

describe('mergeCollections', () => {
    it('returns the incoming list on a first read', () => {
        const next = [row('a'), row('b')];
        expect(mergeCollections<Row>([], next, keyOf)).toBe(next);
    });

    it('returns the very same array when nothing changed', () => {
        const previous = [row('a'), row('b')];
        const merged = mergeCollections(previous, [row('a'), row('b')], keyOf);

        // Identity, not equality: the ref holding this never fires, so no row
        // re-renders and no list transition runs.
        expect(merged).toBe(previous);
    });

    it('keeps the object of every row that did not change', () => {
        const previous = [row('a'), row('b')];
        const merged = mergeCollections(previous, [row('a'), row('b', { speed: 42 })], keyOf);

        expect(merged).not.toBe(previous);
        expect(merged[0]).toBe(previous[0]);
        expect(merged[1]).not.toBe(previous[1]);
        expect(merged[1]!.speed).toBe(42);
    });

    it('holds rows in the order they are already displayed in', () => {
        const previous = [row('a'), row('b'), row('c')];
        // The daemon reports the same three the other way round
        const merged = mergeCollections(previous, [row('c'), row('b'), row('a')], keyOf);

        expect(merged).toBe(previous);
    });

    it('appends new rows and drops the ones that are gone', () => {
        const previous = [row('a'), row('b')];
        const merged = mergeCollections(previous, [row('b'), row('c')], keyOf);

        expect(merged.map(keyOf)).toEqual(['b', 'c']);
        expect(merged[0]).toBe(previous[1]);
    });

    it('empties the list when the fresh read is empty', () => {
        expect(mergeCollections([row('a')], [], keyOf)).toEqual([]);
    });

    it('treats repeated keys as separate rows', () => {
        // Uploads have no id of their own, so two peers on one file can collide
        const previous = [row('a', { speed: 1 }), row('a', { speed: 2 })];
        const merged = mergeCollections(previous, [row('a', { speed: 1 }), row('a', { speed: 3 })], keyOf);

        expect(merged).toHaveLength(2);
        expect(merged[0]).toBe(previous[0]);
        expect(merged[1]!.speed).toBe(3);
    });

    it('notices a field that changed back and forth', () => {
        const first = [row('a', { speed: 0 })];
        const busy = mergeCollections(first, [row('a', { speed: 10 })], keyOf);
        const idle = mergeCollections(busy, [row('a', { speed: 0 })], keyOf);

        expect(busy[0]!.speed).toBe(10);
        expect(idle[0]!.speed).toBe(0);
        expect(idle).not.toBe(busy);
    });
});
