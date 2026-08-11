import { describe, it, expect } from 'vitest';
import { diffQueue, toSnapshot, type QueueEntry } from '../server/utils/downloadEvents';

const NOW = 1_700_000_000_000;

const entry = (hash: string, overrides: Partial<QueueEntry> = {}): QueueEntry => ({
    hash,
    name: `${hash}.bin`,
    size: 1024,
    percentComplete: 0,
    status: 'Downloading',
    ...overrides
});

const snapshot = (...entries: QueueEntry[]) => toSnapshot(entries);

describe('diffQueue', () => {
    it('says nothing about the first reading', () => {
        // Otherwise restarting the server announces the whole queue as new
        expect(diffQueue(null, snapshot(entry('a'), entry('b')), NOW)).toEqual([]);
    });

    it('reports a download that appeared', () => {
        const events = diffQueue(snapshot(entry('a')), snapshot(entry('a'), entry('b')), NOW);

        expect(events).toEqual([{ kind: 'added', hash: 'b', name: 'b.bin', size: 1024, at: NOW }]);
    });

    it('reports a download that reached 100%', () => {
        const events = diffQueue(
            snapshot(entry('a', { percentComplete: 80 })),
            snapshot(entry('a', { percentComplete: 100, status: 'Complete' })),
            NOW
        );

        expect(events.map(event => event.kind)).toEqual(['completed']);
    });

    it('does not report the same completion twice', () => {
        const complete = snapshot(entry('a', { percentComplete: 100, status: 'Complete' }));

        expect(diffQueue(complete, complete, NOW)).toEqual([]);
    });

    it('treats a download that leaves the queue nearly finished as completed', () => {
        // aMule drops a finished file from the queue and moves it to incoming, so
        // this is how completion usually arrives
        const events = diffQueue(snapshot(entry('a', { percentComplete: 99.8 })), snapshot(), NOW);

        expect(events).toEqual([{ kind: 'completed', hash: 'a', name: 'a.bin', size: 1024, at: NOW }]);
    });

    it('says nothing when a download is cancelled', () => {
        expect(diffQueue(snapshot(entry('a', { percentComplete: 12 })), snapshot(), NOW)).toEqual([]);
    });

    it('does not announce a completion twice when the file also leaves the queue', () => {
        const complete = entry('a', { percentComplete: 100, status: 'Complete' });

        // Reported while still queued...
        expect(diffQueue(snapshot(entry('a', { percentComplete: 99 })), snapshot(complete), NOW)
            .map(event => event.kind)).toEqual(['completed']);
        // ...and not again when aMule moves it out
        expect(diffQueue(snapshot(complete), snapshot(), NOW)).toEqual([]);
    });

    it('does not call an already finished file new', () => {
        // A finished file re-appearing (a rehash, a re-add) is not something the
        // user just started
        const events = diffQueue(
            snapshot(),
            snapshot(entry('a', { percentComplete: 100, status: 'Complete' })),
            NOW
        );

        expect(events.map(event => event.kind)).toEqual(['completed']);
    });

    it('reports several changes in one reading', () => {
        const events = diffQueue(
            snapshot(entry('a', { percentComplete: 99.9 }), entry('b')),
            snapshot(entry('b'), entry('c')),
            NOW
        );

        expect(events.map(event => `${event.kind}:${event.hash}`).sort())
            .toEqual(['added:c', 'completed:a']);
    });
});
