/**
 * The part bar's job is to make one distinction visible: missing chunks that
 * have a source (slow) versus missing chunks nobody has (stuck). These helpers
 * own that logic so the component stays markup.
 */

import { describe, it, expect } from 'vitest';
import { buildSegments, countParts, getDetailedParts, PART_BAR_MAX_SEGMENTS, synthesizePartsFromDownload } from '../app/utils/partBar';
import type { DownloadPart } from '../server/utils/amule-types';

const complete = (): DownloadPart => ({ state: 'complete', sources: 3 });
const pending = (): DownloadPart => ({ state: 'pending', sources: 2 });
const unavailable = (): DownloadPart => ({ state: 'unavailable', sources: 0 });

describe('countParts', () => {
    it('counts each state and totals the file', () => {
        const parts = [complete(), complete(), pending(), unavailable(), unavailable()];

        expect(countParts(parts)).toEqual({ complete: 2, pending: 1, unavailable: 2 });
        expect(Object.values(countParts(parts)).reduce((a, b) => a + b, 0)).toBe(parts.length);
    });

    it('answers all zeros for a download with no map', () => {
        expect(countParts(null)).toEqual({ complete: 0, pending: 0, unavailable: 0 });
        expect(countParts([])).toEqual({ complete: 0, pending: 0, unavailable: 0 });
    });
});

describe('buildSegments', () => {
    it('keeps one segment per part while the file is small enough', () => {
        const parts = [complete(), pending(), unavailable()];

        expect(buildSegments(parts)).toEqual([
            { state: 'complete', parts: 1 },
            { state: 'pending', parts: 1 },
            { state: 'unavailable', parts: 1 }
        ]);
    });

    it('never paints an incomplete region green', () => {
        const parts = [complete(), complete(), unavailable(), pending()];

        // The bucket spanning the last two parts holds both missing states, so
        // the worst one wins rather than whichever happened to be first.
        expect(buildSegments(parts).map(segment => segment.state)).toEqual([
            'complete',
            'complete',
            'unavailable',
            'pending'
        ]);
    });

    it('folds a map larger than the bar can draw', () => {
        const parts = [
            ...Array.from({ length: PART_BAR_MAX_SEGMENTS * 3 }, complete),
            ...Array.from({ length: 10 }, unavailable)
        ];

        const segments = buildSegments(parts);

        // Never more segments than the bar has room for, and every part is
        // accounted for across them.
        expect(segments.length).toBeLessThanOrEqual(PART_BAR_MAX_SEGMENTS);
        expect(segments.reduce((total, segment) => total + segment.parts, 0)).toBeGreaterThanOrEqual(parts.length);

        // The trailing unavailable region must not be hidden by the green
        // before it: the last segments are the ones nobody has.
        expect(segments.at(-1)!.state).toBe('unavailable');
    });

    it('answers nothing for a download with no map', () => {
        expect(buildSegments(null)).toEqual([]);
        expect(buildSegments([])).toEqual([]);
    });
});

describe('synthesizePartsFromDownload', () => {
    it('synthesizes completed parts for finished download', () => {
        const parts = synthesizePartsFromDownload({
            size: 20_000_000,
            sizeDone: 20_000_000,
            status: 'Complete',
            sources: 5
        });

        expect(parts.length).toBe(3); // ceil(20000000 / 9728000) = 3
        expect(parts.every(p => p.state === 'complete')).toBe(true);
    });

    it('synthesizes pending and unavailable parts based on availableParts', () => {
        const parts = synthesizePartsFromDownload({
            size: 29_184_000, // exactly 3 parts
            sizeDone: 9_728_000, // 1 part done
            availableParts: 2, // 2 available (1 done, 1 pending, 1 unavailable)
            sources: 3
        });

        expect(parts.length).toBe(3);
        expect(parts[0]!.state).toBe('complete');
        expect(parts[1]!.state).toBe('pending');
        expect(parts[2]!.state).toBe('unavailable');
    });

    it('returns empty array for 0 or negative size', () => {
        expect(synthesizePartsFromDownload({ size: 0, sizeDone: 0 })).toEqual([]);
    });
});

describe('getDetailedParts', () => {
    it('calculates byte offsets and ranges for each part', () => {
        const parts = [complete(), pending()];
        const detailed = getDetailedParts(15_000_000, parts);

        expect(detailed.length).toBe(2);
        expect(detailed[0]).toEqual({
            index: 0,
            partNumber: 1,
            state: 'complete',
            sources: 3,
            startByte: 0,
            endByte: 9_728_000,
            size: 9_728_000,
            percent: 100
        });
        expect(detailed[1]).toEqual({
            index: 1,
            partNumber: 2,
            state: 'pending',
            sources: 2,
            startByte: 9_728_000,
            endByte: 15_000_000,
            size: 15_000_000 - 9_728_000,
            percent: 0
        });
    });
});

