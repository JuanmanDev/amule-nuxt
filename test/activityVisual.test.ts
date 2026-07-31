import { describe, it, expect } from 'vitest';
import { buildActivityVisual, polygonPoints } from '../shared/utils/activityVisual';

describe('buildActivityVisual', () => {
    it('produces nothing while the daemon is idle', () => {
        const visual = buildActivityVisual({});

        expect(visual.shapes).toEqual([]);
        expect(visual.upIntensity).toBe(0);
        expect(visual.downIntensity).toBe(0);
        // Idle is treated as balanced so the tint sits in the middle
        expect(visual.uploadShare).toBe(0.5);
    });

    it('rises for uploads and falls for downloads', () => {
        const uploading = buildActivityVisual({ uploadSpeed: 500 });
        expect(uploading.shapes.every(shape => shape.direction === 'up')).toBe(true);

        const downloading = buildActivityVisual({ downloadSpeed: 500 });
        expect(downloading.shapes.every(shape => shape.direction === 'down')).toBe(true);

        const both = buildActivityVisual({ uploadSpeed: 500, downloadSpeed: 500 });
        expect(both.shapes.some(shape => shape.direction === 'up')).toBe(true);
        expect(both.shapes.some(shape => shape.direction === 'down')).toBe(true);
    });

    it('adds shapes as the transfer gets busier', () => {
        const slow = buildActivityVisual({ downloadSpeed: 50 });
        const fast = buildActivityVisual({ downloadSpeed: 2048 });

        expect(fast.shapes.length).toBeGreaterThan(slow.shapes.length);
    });

    it('adds one shape per transferring file', () => {
        const withoutFiles = buildActivityVisual({ downloadSpeed: 100 });
        const withFiles = buildActivityVisual({ downloadSpeed: 100, downloadFiles: 4 });

        expect(withFiles.shapes.length).toBeGreaterThan(withoutFiles.shapes.length);
    });

    it('shows shapes for queued files even before any speed is reported', () => {
        const visual = buildActivityVisual({ downloadFiles: 2 });

        expect(visual.shapes.length).toBeGreaterThan(0);
        expect(visual.shapes.every(shape => shape.direction === 'down')).toBe(true);
    });

    it('weights the colour towards whichever direction moves more data', () => {
        expect(buildActivityVisual({ uploadSpeed: 900, downloadSpeed: 100 }).uploadShare).toBeCloseTo(0.9);
        expect(buildActivityVisual({ uploadSpeed: 100, downloadSpeed: 900 }).uploadShare).toBeCloseTo(0.1);
        expect(buildActivityVisual({ uploadSpeed: 400, downloadSpeed: 400 }).uploadShare).toBeCloseTo(0.5);
    });

    it('spins and travels faster when busier, without going wild', () => {
        const slow = buildActivityVisual({ downloadSpeed: 20 }).shapes[0]!;
        const fast = buildActivityVisual({ downloadSpeed: 2048 }).shapes[0]!;

        expect(fast.spin).toBeLessThan(slow.spin);
        expect(fast.duration).toBeLessThan(slow.duration);
        expect(fast.spin).toBeGreaterThanOrEqual(4);
        expect(fast.duration).toBeGreaterThanOrEqual(6);
    });

    it('caps the number of shapes and keeps them on screen', () => {
        const visual = buildActivityVisual({
            uploadSpeed: 99_999,
            downloadSpeed: 99_999,
            uploadFiles: 100,
            downloadFiles: 100
        });

        expect(visual.shapes.length).toBeLessThanOrEqual(14);
        expect(visual.shapes.every(shape => shape.left >= 0 && shape.left < 96)).toBe(true);
        expect(visual.upIntensity).toBeLessThanOrEqual(1);
    });

    it('is deterministic, so server and client render the same markup', () => {
        const input = { uploadSpeed: 321, downloadSpeed: 123, downloadFiles: 2 };
        expect(buildActivityVisual(input)).toEqual(buildActivityVisual(input));
    });

    it('ignores negative speeds', () => {
        expect(buildActivityVisual({ uploadSpeed: -500, downloadSpeed: -1 }).shapes).toEqual([]);
    });

    it('uses squares, hexagons and triangles', () => {
        const visual = buildActivityVisual({ downloadSpeed: 2048, downloadFiles: 4 });
        expect(new Set(visual.shapes.map(shape => shape.sides))).toEqual(new Set([4, 6, 3]));
    });
});

describe('polygonPoints', () => {
    it('returns one point per side', () => {
        expect(polygonPoints(4).split(' ')).toHaveLength(4);
        expect(polygonPoints(6).split(' ')).toHaveLength(6);
    });

    it('never returns fewer than three points', () => {
        expect(polygonPoints(1).split(' ')).toHaveLength(3);
    });

    it('stays inside the requested box', () => {
        const coordinates = polygonPoints(6, 40)
            .split(' ')
            .flatMap(point => point.split(',').map(Number));

        expect(Math.min(...coordinates)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...coordinates)).toBeLessThanOrEqual(40);
    });
});
