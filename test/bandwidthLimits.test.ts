import { describe, it, expect } from 'vitest';
import {
    normalizeBandwidthLimit,
    MAX_BANDWIDTH_LIMIT_KBPS
} from '../server/utils/amule-ec/AmuleECClient';

describe('normalizeBandwidthLimit', () => {
    it('accepts whole kB/s values, including 0 for unlimited', () => {
        expect(normalizeBandwidthLimit(0, 'Upload limit')).toBe(0);
        expect(normalizeBandwidthLimit(111, 'Upload limit')).toBe(111);
        expect(normalizeBandwidthLimit(MAX_BANDWIDTH_LIMIT_KBPS, 'Upload limit'))
            .toBe(MAX_BANDWIDTH_LIMIT_KBPS);
    });

    it('accepts the numeric strings an HTTP body carries', () => {
        expect(normalizeBandwidthLimit('250', 'Download limit')).toBe(250);
        expect(normalizeBandwidthLimit(' 250 ', 'Download limit')).toBe(250);
    });

    it('rounds fractional values to whole kB/s', () => {
        expect(normalizeBandwidthLimit(12.4, 'Upload limit')).toBe(12);
        expect(normalizeBandwidthLimit(12.6, 'Upload limit')).toBe(13);
    });

    // The EC tag is written with setUint32, which turns each of these into 0 --
    // aMule's "unlimited". Silently removing the limit is the failure mode this
    // guards against, so they have to be rejected rather than coerced.
    it.each([
        [undefined, 'undefined'],
        [null, 'null'],
        ['', 'empty string'],
        ['   ', 'blank string'],
        ['abc', 'non-numeric string'],
        [Number.NaN, 'NaN'],
        [Number.POSITIVE_INFINITY, 'Infinity'],
        [true, 'boolean'],
        [{}, 'object']
    ])('rejects %s (%s)', value => {
        expect(() => normalizeBandwidthLimit(value, 'Upload limit')).toThrow(/must be a number/);
    });

    it('rejects negative limits and points at 0 instead', () => {
        expect(() => normalizeBandwidthLimit(-1, 'Upload limit'))
            .toThrow(/cannot be negative; use 0 for unlimited/);
    });

    it('rejects limits above what aMule accepts', () => {
        expect(() => normalizeBandwidthLimit(MAX_BANDWIDTH_LIMIT_KBPS + 1, 'Download limit'))
            .toThrow(/cannot exceed 1000000 kB\/s/);
    });

    it('names the offending field so the UI can show it', () => {
        expect(() => normalizeBandwidthLimit('nope', 'Download limit')).toThrow(/^Download limit/);
    });
});
