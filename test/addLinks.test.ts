import { describe, it, expect } from 'vitest';
import { summariseAddResults } from '../shared/utils/addLinks';
import type { AddLinkResult, AddLinksResult } from '../shared/types/api';

const result = (status: AddLinkResult['status'], overrides: Partial<AddLinkResult> = {}): AddLinkResult => ({
    link: 'ed2k://|file|file.bin|1024|abcdef0123456789abcdef0123456789|/',
    success: status !== 'rejected',
    status,
    message: status === 'added'
        ? 'Download added'
        : status === 'duplicate'
            ? "Already in the download queue as 'file.bin' - aMule merged the sources"
            : 'ed2k link has an invalid file size',
    ...overrides
});

const payload = (results: AddLinkResult[]): AddLinksResult => ({
    results,
    added: results.filter(entry => entry.status === 'added').length,
    duplicates: results.filter(entry => entry.status === 'duplicate').length,
    rejected: results.filter(entry => entry.status === 'rejected').length
});

describe('summariseAddResults', () => {
    it('handles an empty payload', () => {
        expect(summariseAddResults(null).title).toBe('Nothing to add');
        expect(summariseAddResults(payload([])).total).toBe(0);
    });

    it('reports a single added link as success', () => {
        const summary = summariseAddResults(payload([result('added')]));
        expect(summary.title).toBe('Download added');
        expect(summary.color).toBe('success');
        expect(summary.anyAdded).toBe(true);
    });

    it('reports a single duplicate as a warning naming the existing file', () => {
        const summary = summariseAddResults(payload([result('duplicate', { existingName: 'file.bin' })]));
        expect(summary.title).toBe('Already in aMule');
        expect(summary.color).toBe('warning');
        expect(summary.description).toContain('Already in the download queue');
        expect(summary.anyAdded).toBe(false);
        expect(summary.duplicates).toBe(1);
    });

    it('reports a single rejected link as an error with the reason', () => {
        const summary = summariseAddResults(payload([result('rejected')]));
        expect(summary.title).toBe('Link rejected');
        expect(summary.color).toBe('error');
        expect(summary.description).toContain('invalid file size');
    });

    it('summarises a mixed batch and lists the exceptions', () => {
        const summary = summariseAddResults(payload([
            result('added'),
            result('duplicate', { existingName: 'already.bin' }),
            result('rejected')
        ]));

        expect(summary.title).toBe('Added 1 of 3 links');
        expect(summary.color).toBe('warning');
        expect(summary.description).toContain('1 link already in aMule: already.bin');
        expect(summary.description).toContain('1 link rejected');
    });

    it('uses success only when every link in a batch is new', () => {
        const summary = summariseAddResults(payload([result('added'), result('added')]));
        expect(summary.title).toBe('Added 2 of 2 links');
        expect(summary.color).toBe('success');
        expect(summary.description).toBeUndefined();
    });

    it('says nothing new was added when a batch is all duplicates', () => {
        const summary = summariseAddResults(payload([
            result('duplicate', { existingName: 'a.bin' }),
            result('duplicate', { existingName: 'b.bin' })
        ]));

        expect(summary.title).toBe('Nothing new added');
        expect(summary.color).toBe('warning');
        expect(summary.description).toContain('2 links already in aMule: a.bin, b.bin');
        expect(summary.anyAdded).toBe(false);
    });

    it('errors when a whole batch is rejected', () => {
        const summary = summariseAddResults(payload([result('rejected'), result('rejected')]));
        expect(summary.title).toBe('No links added');
        expect(summary.color).toBe('error');
    });
});
