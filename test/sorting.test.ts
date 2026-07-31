import { describe, it, expect } from 'vitest';
import { filterItems, sortItems } from '../shared/utils/sorting';

interface Row {
    name: string;
    size: number;
    user?: string;
}

const rows: Row[] = [
    { name: 'beta.bin', size: 30, user: 'ana' },
    { name: 'Alpha.bin', size: 10, user: 'bob' },
    { name: 'gamma.bin', size: 20, user: 'Cleo' }
];

const accessors = {
    name: (row: Row) => row.name,
    size: (row: Row) => row.size
};

describe('sortItems', () => {
    it('sorts numbers in both directions', () => {
        expect(sortItems(rows, 'size', 'asc', accessors).map(row => row.size)).toEqual([10, 20, 30]);
        expect(sortItems(rows, 'size', 'desc', accessors).map(row => row.size)).toEqual([30, 20, 10]);
    });

    it('sorts strings case-insensitively in both directions', () => {
        expect(sortItems(rows, 'name', 'asc', accessors).map(row => row.name))
            .toEqual(['Alpha.bin', 'beta.bin', 'gamma.bin']);
        expect(sortItems(rows, 'name', 'desc', accessors).map(row => row.name))
            .toEqual(['gamma.bin', 'beta.bin', 'Alpha.bin']);
    });

    it('orders embedded numbers naturally', () => {
        const episodes = [{ name: 'ep10' }, { name: 'ep2' }, { name: 'ep1' }];
        const sorted = sortItems(episodes, 'name', 'asc', { name: row => row.name });
        expect(sorted.map(row => row.name)).toEqual(['ep1', 'ep2', 'ep10']);
    });

    it('does not mutate the input and tolerates an unknown key', () => {
        const original = [...rows];
        sortItems(rows, 'size', 'asc', accessors);
        expect(rows).toEqual(original);
        expect(sortItems(rows, 'nope', 'asc', accessors)).toEqual(rows);
    });
});

describe('filterItems', () => {
    it('matches any of the given fields, case-insensitively', () => {
        const found = filterItems(rows, 'CLEO', row => [row.name, row.user]);
        expect(found.map(row => row.name)).toEqual(['gamma.bin']);
    });

    it('matches numeric fields too', () => {
        expect(filterItems(rows, '20', row => [row.name, row.size]).map(row => row.name)).toEqual(['gamma.bin']);
    });

    it('returns everything for an empty query', () => {
        expect(filterItems(rows, '   ', row => [row.name])).toHaveLength(3);
    });

    it('returns nothing when no field matches', () => {
        expect(filterItems(rows, 'zzz', row => [row.name, row.user])).toEqual([]);
    });
});
