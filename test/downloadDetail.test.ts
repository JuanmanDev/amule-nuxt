import { describe, it, expect } from 'vitest';
import { mergeDownloadDetail, mergeSharedDetail, remainingSeconds } from '../app/utils/downloadDetail';
import { mediaFactList } from '../app/utils/media';
import { formatSeconds } from '../shared/utils/format';
import type { Download, SharedFile } from '../server/utils/amule-types';

/**
 * The details views merge the live list entry (pushed every couple of seconds)
 * with a detail reading fetched only while they are open. Over amuleapi the
 * list leaves some figures unknown that the detail has; over EC both readings
 * are the same queue entry.
 */

const HASH = '0123456789abcdef0123456789abcdef';

const live: Download = {
    hash: HASH,
    name: 'file.iso',
    size: 100 * 1024,
    sizeDone: 50 * 1024,
    status: 'Downloading',
    priority: 'Normal',
    autoPriority: false,
    speed: 10,
    sources: 5,
    sourcesNotCurrent: 0,
    sourcesA4AF: 0,
    sourcesXfer: 2,
    percentComplete: 50,
    ed2kLink: '',
    availableParts: 0,
    stopped: false,
    lastReceived: 0,
    lastSeenComplete: 0
};

describe('mergeDownloadDetail', () => {
    it('keeps the live figures and adds what only the detail knows', () => {
        const detail: Download = {
            ...live,
            speed: 1,
            sizeDone: 10,
            availableParts: 11,
            lastReceived: 1_700_000_000,
            lastSeenComplete: 1_700_000_100,
            parts: [{ state: 'complete', sources: 3 }],
            remainingSeconds: 42,
            directory: '/temp',
            media: null
        };

        const merged = mergeDownloadDetail(live, detail)!;

        // Live wins for what moves
        expect(merged.speed).toBe(10);
        expect(merged.sizeDone).toBe(50 * 1024);
        // Detail fills what amuleapi's list leaves unknown
        expect(merged).toMatchObject({
            availableParts: 11,
            lastReceived: 1_700_000_000,
            lastSeenComplete: 1_700_000_100,
            remainingSeconds: 42,
            directory: '/temp',
            media: null
        });
        expect(merged.parts).toHaveLength(1);
    });

    it('ignores a detail for another download', () => {
        expect(mergeDownloadDetail(live, { ...live, hash: 'f'.repeat(32), directory: '/x' })).toBe(live);
    });

    it('passes the live entry through while the detail loads', () => {
        expect(mergeDownloadDetail(live, undefined)).toBe(live);
        expect(mergeDownloadDetail(null, live)).toBe(null);
    });
});

describe('remainingSeconds', () => {
    it("prefers the daemon's own estimate", () => {
        expect(remainingSeconds({ ...live, remainingSeconds: 90 })).toBe(90);
    });

    it('falls back to bytes left over speed', () => {
        // 50 KiB left at 10 KB/s
        expect(remainingSeconds(live)).toBe(5);
    });

    it('has no estimate when stalled, and keeps a null from the daemon as unknown', () => {
        expect(remainingSeconds({ ...live, speed: 0 })).toBe(null);
        expect(remainingSeconds({ ...live, speed: 0, remainingSeconds: null })).toBe(null);
    });
});

describe('mergeSharedDetail', () => {
    const file = {
        hash: HASH,
        fileName: 'a.mkv',
        fullPath: '',
        comment: '',
        onQueue: 0,
        uploadingClients: 2
    } as SharedFile;

    it('fills the path, comment and queue amuleapi lists leave blank', () => {
        const merged = mergeSharedDetail(file, {
            ...file,
            fullPath: '/share/a.mkv',
            directory: '/share',
            comment: 'great',
            onQueue: 4,
            partSources: [3, 1],
            uploadingClients: 0
        })!;

        expect(merged).toMatchObject({ fullPath: '/share/a.mkv', directory: '/share', comment: 'great', onQueue: 4, partSources: [3, 1] });
        // The live list keeps the moving figures
        expect(merged.uploadingClients).toBe(2);
    });
});

describe('formatSeconds', () => {
    it('reads like the ETA', () => {
        expect(formatSeconds(0)).toBe('0s');
        expect(formatSeconds(59)).toBe('59s');
        expect(formatSeconds(5400)).toBe('1h 30m');
        expect(formatSeconds(90_000)).toBe('1d 1h');
        expect(formatSeconds(null)).toBe(null);
        expect(formatSeconds(-1)).toBe(null);
    });
});

describe('mediaFactList', () => {
    const t = (key: string) => key;

    it('lists what is there, in reading order', () => {
        expect(mediaFactList({ codec: 'H.264', durationSeconds: 5400, title: 'Film', bitrateKbps: 1500 }, t)).toEqual([
            { label: 'media.title', value: 'Film' },
            { label: 'media.duration', value: '1h 30m' },
            { label: 'media.codec', value: 'H.264' },
            { label: 'media.bitrate', value: '1500 kbps' }
        ]);
    });

    it('is empty without media', () => {
        expect(mediaFactList(null, t)).toEqual([]);
        expect(mediaFactList(undefined, t)).toEqual([]);
    });
});
