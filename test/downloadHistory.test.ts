import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { QueueEntry } from '../server/utils/downloadEvents';

const dataDir = mkdtempSync(join(tmpdir(), 'amule-history-'));
process.env.AMULE_DATA_DIR = dataDir;

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

const entry = (hash: string, overrides: Partial<QueueEntry> = {}): QueueEntry => ({
    hash,
    name: `${hash}.bin`,
    size: 2048,
    percentComplete: 0,
    status: 'Downloading',
    ...overrides
});

/**
 * The module keeps its state in memory, so each case gets a fresh copy of it -
 * otherwise the second test would inherit the first one's "already seen" queue.
 */
async function freshModule() {
    // Its own directory as well, so one case cannot read another's file back
    process.env.AMULE_DATA_DIR = join(dataDir, Math.random().toString(36).slice(2));
    vi.resetModules();
    return import('../server/utils/downloadHistory');
}

describe('downloadHistory', () => {
    let history: typeof import('../server/utils/downloadHistory');

    beforeEach(async () => {
        history = await freshModule();
    });

    it('does not claim a start time for a queue it did not watch grow', async () => {
        // Everything already queued when the app starts began at some unknown
        // point before that, and saying otherwise would be making data up
        await history.recordQueue([entry('a')], true);

        const [annotated] = await history.withHistory([{ hash: 'a' }]);
        expect(annotated!.startKnown).toBe(false);
        expect(annotated!.addedAt).toBeUndefined();
        expect(annotated!.firstSeenAt).toBeGreaterThan(0);
    });

    it('records a real start time for a download it saw arrive', async () => {
        await history.recordQueue([entry('a')], true);
        await history.recordQueue([entry('a'), entry('b')], false);

        const [, arrived] = await history.withHistory([{ hash: 'a' }, { hash: 'b' }]);
        expect(arrived!.startKnown).toBe(true);
        expect(arrived!.addedAt).toBeGreaterThan(0);
    });

    it('keeps the completion time after the file leaves the queue', async () => {
        await history.recordQueue([entry('a')], false);
        await history.recordCompleted('a', 'a.bin', 2048, 1_700_000_000_000);
        // aMule has moved it out of the queue by the next reading
        await history.recordQueue([], false);

        const [annotated] = await history.withHistory([{ hash: 'a' }]);
        expect(annotated!.completedAt).toBe(1_700_000_000_000);
    });

    it('does not move a completion time that was already recorded', async () => {
        await history.recordQueue([entry('a')], false);
        await history.recordCompleted('a', 'a.bin', 2048, 1_700_000_000_000);
        await history.recordCompleted('a', 'a.bin', 2048, 1_800_000_000_000);

        expect((await history.historyFor('a'))?.completedAt).toBe(1_700_000_000_000);
    });

    it('follows the name aMule settles on once it knows the real one', async () => {
        await history.recordQueue([entry('a', { name: 'a.bin.part' })], false);
        await history.recordQueue([entry('a', { name: 'The Real Name.mkv' })], false);

        expect((await history.historyFor('a'))?.name).toBe('The Real Name.mkv');
    });

    it('leaves an unknown hash alone', async () => {
        const [annotated] = await history.withHistory([{ hash: 'nothing-here' }]);
        expect(annotated).toEqual({ hash: 'nothing-here' });
    });
});
