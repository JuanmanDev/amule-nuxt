import { describe, it, expect } from 'vitest';
import { prune, RETENTION_MS, type StoredSearch } from '../server/utils/searchStore';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const search = (id: string, overrides: Partial<StoredSearch> = {}): StoredSearch => ({
    id,
    keyword: id,
    type: 'Kad',
    startedAt: NOW,
    updatedAt: NOW,
    status: 'done',
    results: [],
    ...overrides
});

describe('search retention', () => {
    it('keeps a search from today', () => {
        expect(prune([search('a')], NOW).map(entry => entry.id)).toEqual(['a']);
    });

    it('keeps one last touched six days ago', () => {
        const recent = search('a', { updatedAt: NOW - 6 * DAY });
        expect(prune([recent], NOW).map(entry => entry.id)).toEqual(['a']);
    });

    it('drops one last touched eight days ago', () => {
        const stale = search('a', { updatedAt: NOW - 8 * DAY });
        expect(prune([stale], NOW)).toEqual([]);
    });

    it('counts the week from the last time it was touched, not from the start', () => {
        // Started ten days ago but re-run yesterday: still wanted
        const rerun = search('a', { startedAt: NOW - 10 * DAY, updatedAt: NOW - DAY });
        expect(prune([rerun], NOW).map(entry => entry.id)).toEqual(['a']);
    });

    it('drops one exactly at the edge of the window', () => {
        expect(prune([search('a', { updatedAt: NOW - RETENTION_MS })], NOW)).toEqual([]);
    });

    it('orders newest first', () => {
        const all = [
            search('old', { updatedAt: NOW - 3 * DAY }),
            search('new', { updatedAt: NOW }),
            search('middle', { updatedAt: NOW - DAY })
        ];

        expect(prune(all, NOW).map(entry => entry.id)).toEqual(['new', 'middle', 'old']);
    });

    it('keeps only the newest twenty', () => {
        // The cap exists because this is a JSON file, not a database
        const all = Array.from({ length: 30 }, (_, index) =>
            search(`s${index}`, { updatedAt: NOW - index * 1000 })
        );

        const kept = prune(all, NOW);
        expect(kept).toHaveLength(20);
        expect(kept[0]!.id).toBe('s0');
        expect(kept.at(-1)!.id).toBe('s19');
    });
});
