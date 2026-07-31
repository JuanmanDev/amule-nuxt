import { describe, it, expect } from 'vitest';
import { classifyDownload, isLikelyDeadLink } from '../shared/utils/downloadHealth';

const base = {
    status: 'Waiting',
    speed: 0,
    sources: 0,
    sourcesXfer: 0,
    sizeDone: 0,
    percentComplete: 0,
    stopped: false
};

describe('classifyDownload', () => {
    it('flags a queued file with no sources as stalled and explains the hash', () => {
        const info = classifyDownload(base);
        expect(info.health).toBe('stalled');
        expect(info.label).toBe('No sources');
        expect(info.color).toBe('warning');
        expect(info.reason).toContain('32 character hash');
    });

    it('treats a partially downloaded file that lost its sources differently', () => {
        const info = classifyDownload({ ...base, sizeDone: 1024, percentComplete: 12 });
        expect(info.health).toBe('stalled');
        expect(info.reason).toContain('went offline');
        expect(info.reason).not.toContain('32 character hash');
    });

    it('reports waiting when sources exist but none are transferring', () => {
        const info = classifyDownload({ ...base, sources: 3 });
        expect(info.health).toBe('waiting');
        expect(info.reason).toContain('3 sources');
    });

    it('uses the singular form for a single source', () => {
        expect(classifyDownload({ ...base, sources: 1 }).reason).toContain('1 source,');
    });

    it('reports downloading on speed or transferring sources', () => {
        expect(classifyDownload({ ...base, sources: 2, speed: 40 }).health).toBe('downloading');
        expect(classifyDownload({ ...base, sources: 2, sourcesXfer: 1 }).health).toBe('downloading');
    });

    it('keeps paused, stopped, complete, hashing and error states', () => {
        expect(classifyDownload({ ...base, status: 'Paused' }).health).toBe('paused');
        expect(classifyDownload({ ...base, stopped: true }).health).toBe('stopped');
        expect(classifyDownload({ ...base, status: 'Complete' }).health).toBe('complete');
        expect(classifyDownload({ ...base, status: 'Hashing' }).health).toBe('hashing');
        expect(classifyDownload({ ...base, status: 'Error' }).health).toBe('error');
    });

    it('prefers stopped over the paused status flag', () => {
        expect(classifyDownload({ ...base, status: 'Paused', stopped: true }).health).toBe('stopped');
    });

    it('does not mark a paused file as stalled even without sources', () => {
        expect(classifyDownload({ ...base, status: 'Paused' }).health).not.toBe('stalled');
    });

    it('tolerates a partial payload', () => {
        expect(classifyDownload({}).health).toBe('stalled');
    });
});

describe('isLikelyDeadLink', () => {
    it('is true for a never started download with no sources', () => {
        expect(isLikelyDeadLink(base)).toBe(true);
    });

    it('is false once bytes were received', () => {
        expect(isLikelyDeadLink({ ...base, sizeDone: 4096 })).toBe(false);
    });

    it('is false while sources are known', () => {
        expect(isLikelyDeadLink({ ...base, sources: 1 })).toBe(false);
    });

    it('is false for paused downloads', () => {
        expect(isLikelyDeadLink({ ...base, status: 'Paused' })).toBe(false);
    });
});
