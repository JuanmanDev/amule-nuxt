import { describe, it, expect } from 'vitest';
import {
    formatBytes,
    formatBytesPerSecond,
    formatEta,
    formatPercent,
    formatSpeed,
    formatTimestamp
} from '../shared/utils/format';

describe('formatBytes', () => {
    it('scales through the units', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(1536)).toBe('1.50 KB');
        expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
        expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GB');
        expect(formatBytes(2 * 1024 ** 4)).toBe('2.00 TB');
    });

    it('treats missing and non positive values as zero', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(-5)).toBe('0 B');
        expect(formatBytes(undefined)).toBe('0 B');
        expect(formatBytes(Number.NaN)).toBe('0 B');
    });
});

describe('formatSpeed', () => {
    it('formats KB/s and switches to MB/s', () => {
        expect(formatSpeed(0)).toBe('0 KB/s');
        expect(formatSpeed(12.5)).toBe('12.50 KB/s');
        expect(formatSpeed(2048)).toBe('2.00 MB/s');
    });
});

describe('formatBytesPerSecond', () => {
    it('formats a byte rate', () => {
        expect(formatBytesPerSecond(0)).toBe('0 B/s');
        expect(formatBytesPerSecond(1024)).toBe('1.00 KB/s');
        expect(formatBytesPerSecond(9752633)).toBe('9.30 MB/s');
    });
});

describe('formatPercent', () => {
    it('clamps to the 0..100 range', () => {
        expect(formatPercent(12.3456)).toBe('12.35%');
        expect(formatPercent(-1)).toBe('0.00%');
        expect(formatPercent(140)).toBe('100.00%');
        expect(formatPercent(undefined)).toBe('0.00%');
    });
});

describe('formatTimestamp', () => {
    it('reports "Never" for missing timestamps', () => {
        expect(formatTimestamp(0)).toBe('Never');
        expect(formatTimestamp(undefined)).toBe('Never');
    });

    it('formats a real timestamp', () => {
        expect(formatTimestamp(1_700_000_000)).not.toBe('Never');
    });
});

describe('formatEta', () => {
    it('returns null when it cannot be estimated', () => {
        expect(formatEta(0, 100)).toBeNull();
        expect(formatEta(1024, 0)).toBeNull();
    });

    it('formats seconds, minutes, hours and days', () => {
        expect(formatEta(10 * 1024, 10)).toBe('1s');
        expect(formatEta(600 * 1024, 10)).toBe('1m 0s');
        expect(formatEta(36_000 * 1024, 10)).toBe('1h 0m');
        expect(formatEta(864_000 * 1024, 10)).toBe('1d 0h');
    });
});
