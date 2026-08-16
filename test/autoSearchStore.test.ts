import { describe, it, expect } from 'vitest';
import { mergeResults, MAX_RESULTS_PER_SEARCH, type AutoSearch } from '../server/utils/autoSearchStore';
import { networkForRun } from '../server/utils/autoSearchRunner';
import type { SearchResult } from '../server/utils/amule-types';

const NOW = 1_800_000_000_000;

const result = (hash: string, overrides: Partial<SearchResult> = {}): SearchResult => ({
    resultNumber: 1,
    hash,
    fileName: `${hash}.bin`,
    size: 1000,
    sources: 1,
    ed2kLink: `ed2k://|file|${hash}.bin|1000|${hash}|/`,
    ...overrides
});

const autoSearch = (overrides: Partial<AutoSearch> = {}): AutoSearch => ({
    id: 'auto-test',
    keyword: 'test',
    networks: ['Kad', 'Global'],
    intervalMs: 300_000,
    duration: '1d',
    createdAt: NOW,
    endsAt: NOW + 86_400_000,
    lastRunAt: 0,
    nextRunAt: NOW,
    runs: 0,
    newLastRun: 0,
    status: 'active',
    results: [],
    ...overrides
});

describe('accumulating results across passes', () => {
    it('counts every result of the first pass as new', () => {
        const search = autoSearch();
        const added = mergeResults(search, [result('aa'), result('bb')]);

        expect(added).toBe(2);
        expect(search.results.map(entry => entry.hash)).toEqual(['aa', 'bb']);
    });

    it('does not count a hash seen on an earlier pass', () => {
        const search = autoSearch({ results: [result('aa')] });
        const added = mergeResults(search, [result('aa'), result('bb')]);

        expect(added).toBe(1);
        expect(search.results).toHaveLength(2);
    });

    it('takes the fresh copy of a repeated hash, keeping its place', () => {
        const search = autoSearch({ results: [result('aa', { sources: 1 }), result('bb')] });
        mergeResults(search, [result('aa', { sources: 9 })]);

        expect(search.results[0]!.hash).toBe('aa');
        expect(search.results[0]!.sources).toBe(9);
    });

    it('falls back to the eD2k link when the daemon reported no hash', () => {
        const search = autoSearch();
        mergeResults(search, [result('', { ed2kLink: 'ed2k://x' })]);
        const added = mergeResults(search, [result('', { ed2kLink: 'ed2k://x' })]);

        expect(added).toBe(0);
        expect(search.results).toHaveLength(1);
    });

    it('drops the oldest findings past the cap', () => {
        const search = autoSearch({
            results: Array.from({ length: MAX_RESULTS_PER_SEARCH }, (_, index) => result(`old-${index}`))
        });
        mergeResults(search, [result('fresh')]);

        expect(search.results).toHaveLength(MAX_RESULTS_PER_SEARCH);
        expect(search.results.at(-1)!.hash).toBe('fresh');
        expect(search.results.some(entry => entry.hash === 'old-0')).toBe(false);
    });
});

describe('network rotation', () => {
    it('cycles through the chosen networks pass by pass', () => {
        const search = autoSearch({ networks: ['Kad', 'Global', 'Local'] });

        expect(networkForRun({ ...search, runs: 0 })).toBe('Kad');
        expect(networkForRun({ ...search, runs: 1 })).toBe('Global');
        expect(networkForRun({ ...search, runs: 2 })).toBe('Local');
        expect(networkForRun({ ...search, runs: 3 })).toBe('Kad');
    });

    it('always answers the single network of a one-network search', () => {
        const search = autoSearch({ networks: ['Kad'] });

        expect(networkForRun({ ...search, runs: 7 })).toBe('Kad');
    });
});
