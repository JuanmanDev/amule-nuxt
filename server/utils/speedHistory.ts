/**
 * Rolling transfer-rate history.
 *
 * The daemon only reports the current rate, so the graph on the statistics page
 * would start empty on every page load. Sampling in the Nitro process instead
 * keeps a shared history that survives navigation and page reloads.
 */

export interface SpeedSample {
    /** Unix milliseconds. */
    at: number;
    /** KB/s. */
    upload: number;
    download: number;
}

const SAMPLE_INTERVAL_MS = 2000;
/** 30 minutes at one sample every two seconds. */
const MAX_SAMPLES = 900;

const samples: SpeedSample[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let started = false;

function record(sample: SpeedSample) {
    samples.push(sample);
    if (samples.length > MAX_SAMPLES) {
        samples.splice(0, samples.length - MAX_SAMPLES);
    }
}

/** Starts sampling once per process; further calls are ignored. */
export function startSpeedHistory() {
    if (started) return;
    started = true;

    // Guards against overlapping samples: while the daemon is slow or gone, a
    // sample can outlive its interval and the backlog would compete with the
    // requests the pages are waiting for.
    let sampling = false;

    const sample = async () => {
        if (sampling) return;
        sampling = true;

        try {
            const status = await getAmuleClient().status();
            if (!status?.connected) return;

            record({
                at: Date.now(),
                upload: Number(status.uploadSpeed) || 0,
                download: Number(status.downloadSpeed) || 0
            });
        } catch {
            // A failed sample simply produces no new point
        } finally {
            sampling = false;
        }
    };

    timer = setInterval(sample, SAMPLE_INTERVAL_MS);
    // Never hold the process open just for sampling
    timer.unref?.();
    void sample();
}

export function stopSpeedHistory() {
    if (timer) clearInterval(timer);
    timer = undefined;
    started = false;
}

/** Samples of the last `minutes`, oldest first. */
export function getSpeedHistory(minutes = 30): SpeedSample[] {
    const since = Date.now() - minutes * 60_000;
    return samples.filter(sample => sample.at >= since);
}

export function getSpeedHistoryStats(minutes = 30) {
    const window = getSpeedHistory(minutes);
    if (window.length === 0) {
        return { samples: window, peakUpload: 0, peakDownload: 0, averageUpload: 0, averageDownload: 0 };
    }

    const sum = window.reduce(
        (acc, sample) => ({ upload: acc.upload + sample.upload, download: acc.download + sample.download }),
        { upload: 0, download: 0 }
    );

    return {
        samples: window,
        peakUpload: Math.max(...window.map(sample => sample.upload)),
        peakDownload: Math.max(...window.map(sample => sample.download)),
        averageUpload: sum.upload / window.length,
        averageDownload: sum.download / window.length
    };
}
