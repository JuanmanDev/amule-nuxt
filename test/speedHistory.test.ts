import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * The sampler keeps a rolling window in the server process, which is what lets the
 * statistics chart show history from before the page was opened.
 */

const status = vi.fn();

// getAmuleClient is auto-imported inside Nitro; stub it for the unit test
vi.stubGlobal('getAmuleClient', () => ({ status }));

const loadModule = async () => {
    vi.resetModules();
    return import('../server/utils/speedHistory');
};

describe('speed history', () => {
    beforeEach(() => {
        status.mockReset();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts empty', async () => {
        const { getSpeedHistory, getSpeedHistoryStats } = await loadModule();

        expect(getSpeedHistory()).toEqual([]);
        expect(getSpeedHistoryStats()).toEqual({
            samples: [],
            peakUpload: 0,
            peakDownload: 0,
            averageUpload: 0,
            averageDownload: 0
        });
    });

    it('records samples while the daemon is connected', async () => {
        const { startSpeedHistory, stopSpeedHistory, getSpeedHistory } = await loadModule();

        status.mockResolvedValue({ connected: true, uploadSpeed: 100, downloadSpeed: 50 });

        startSpeedHistory();
        await vi.advanceTimersByTimeAsync(4100);
        stopSpeedHistory();

        const samples = getSpeedHistory();
        expect(samples.length).toBeGreaterThanOrEqual(2);
        expect(samples[0]).toMatchObject({ upload: 100, download: 50 });
        expect(typeof samples[0]!.at).toBe('number');
    });

    it('ignores samples while the daemon is unreachable', async () => {
        const { startSpeedHistory, stopSpeedHistory, getSpeedHistory } = await loadModule();

        status.mockResolvedValue({ connected: false, uploadSpeed: 0, downloadSpeed: 0 });

        startSpeedHistory();
        await vi.advanceTimersByTimeAsync(4100);
        stopSpeedHistory();

        expect(getSpeedHistory()).toEqual([]);
    });

    it('survives a failing status call', async () => {
        const { startSpeedHistory, stopSpeedHistory, getSpeedHistory } = await loadModule();

        status.mockRejectedValue(new Error('connection refused'));

        startSpeedHistory();
        await vi.advanceTimersByTimeAsync(4100);
        stopSpeedHistory();

        expect(getSpeedHistory()).toEqual([]);
    });

    it('computes peaks and averages over the window', async () => {
        const { startSpeedHistory, stopSpeedHistory, getSpeedHistoryStats } = await loadModule();

        status
            .mockResolvedValueOnce({ connected: true, uploadSpeed: 100, downloadSpeed: 20 })
            .mockResolvedValueOnce({ connected: true, uploadSpeed: 300, downloadSpeed: 40 })
            .mockResolvedValue({ connected: true, uploadSpeed: 200, downloadSpeed: 60 });

        startSpeedHistory();
        await vi.advanceTimersByTimeAsync(4100);
        stopSpeedHistory();

        const stats = getSpeedHistoryStats();
        expect(stats.peakUpload).toBe(300);
        expect(stats.peakDownload).toBeGreaterThanOrEqual(40);
        expect(stats.averageUpload).toBeGreaterThan(100);
    });

    it('only starts one sampler per process', async () => {
        const { startSpeedHistory, stopSpeedHistory, getSpeedHistory } = await loadModule();

        status.mockResolvedValue({ connected: true, uploadSpeed: 10, downloadSpeed: 10 });

        startSpeedHistory();
        startSpeedHistory();
        await vi.advanceTimersByTimeAsync(2100);
        stopSpeedHistory();

        // Two samplers would double the samples for the same elapsed time
        expect(getSpeedHistory().length).toBeLessThanOrEqual(2);
    });
});
