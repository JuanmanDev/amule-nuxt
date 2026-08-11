/**
 * The one place that watches the daemon on its own.
 *
 * Two features need a server-side loop: the live push to open browsers, and the
 * notifications that have to work when no browser is open at all. Giving each its
 * own interval meant two readings of the queue every couple of seconds over a
 * single EC connection, competing with the API routes the pages are waiting on.
 *
 * So there is one loop, and both subscribe to it. The cadence follows the
 * audience: fast while a browser is watching, slow when the only reason to look
 * is to catch a download finishing.
 */

import { getAmuleClient } from './getAmuleClient';
import { diffQueue, toSnapshot, type DownloadEvent, type QueueSnapshot } from './downloadEvents';
import { recordCompleted, recordQueue, withHistory } from './downloadHistory';
import { useLogger } from './logger';
import type { Download, StatusResult } from './amule-types';

const log = useLogger('monitor');

export interface AmuleFrame {
    status: StatusResult;
    downloads: Download[];
}

type FrameListener = (frame: AmuleFrame) => void;
type EventListener = (events: DownloadEvent[]) => void;

/** While at least one browser is connected to the live socket. */
const WATCHED_INTERVAL_MS = 2000;
/** With nobody watching: enough to notice a download finishing, cheap enough to leave running. */
const IDLE_INTERVAL_MS = 15_000;

const frameListeners = new Set<FrameListener>();
const eventListeners = new Set<EventListener>();

let timer: ReturnType<typeof setTimeout> | null = null;
let polling = false;
let currentInterval = 0;
let lastSnapshot: QueueSnapshot | null = null;
let lastFrame: AmuleFrame | null = null;
/** Reported by whoever owns the live socket, so the loop knows how fast to run. */
let watchers = 0;

/** The most recent reading, for a client that has just connected. */
export function latestFrame(): AmuleFrame | null {
    return lastFrame;
}

export function setWatcherCount(count: number): void {
    const next = Math.max(0, count);
    if (next === watchers) return;

    watchers = next;
    // Someone started watching: switch to the fast cadence now rather than after
    // the remainder of a fifteen second tick.
    schedule(watchers > 0 ? 0 : IDLE_INTERVAL_MS);
}

function intervalMs(): number {
    return watchers > 0 ? WATCHED_INTERVAL_MS : IDLE_INTERVAL_MS;
}

function schedule(delay = intervalMs()): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, delay);
    currentInterval = delay;
    // Never hold the process open on this alone
    timer.unref?.();
}

async function tick(): Promise<void> {
    if (polling) {
        schedule();
        return;
    }

    polling = true;
    try {
        const client = getAmuleClient();
        // Sequential, not Promise.all: the EC connection serialises requests
        // anyway, and issuing both at once only makes the second one wait behind
        // the first with a timeout already running.
        const status = await client.status();
        const downloads = await client.getDownloads();

        // Recorded before the frame goes out, so the timestamps travel with it:
        // the first reading only adopts what is already queued, since none of it
        // was added while this app was watching.
        await recordQueue(downloads, lastSnapshot === null);

        lastFrame = { status, downloads: await withHistory(downloads) };
        for (const listener of frameListeners) {
            try {
                listener(lastFrame);
            } catch (e) {
                log.warn('A live-update listener threw', e);
            }
        }

        const snapshot = toSnapshot(downloads);
        const events = diffQueue(lastSnapshot, snapshot, Date.now());
        lastSnapshot = snapshot;

        if (events.length > 0) {
            log.debug(`Queue events: ${events.map(event => `${event.kind}:${event.name}`).join(', ')}`);

            // The completion time is only knowable here, and a finished file
            // leaves the queue - so it is written before anything else can miss it
            for (const event of events) {
                if (event.kind === 'completed') {
                    await recordCompleted(event.hash, event.name, event.size, event.at);
                }
            }

            for (const listener of eventListeners) {
                try {
                    listener(events);
                } catch (e) {
                    log.warn('A queue-event listener threw', e);
                }
            }
        }
    } catch (e) {
        // An unreachable daemon is the normal case while it restarts. The snapshot
        // is deliberately kept: dropping it would make every download look new the
        // moment the daemon answers again.
        log.debug('Monitor poll failed, keeping the previous snapshot', e);
    } finally {
        polling = false;
        schedule();
    }
}

export function onFrame(listener: FrameListener): () => void {
    frameListeners.add(listener);
    return () => frameListeners.delete(listener);
}

export function onDownloadEvents(listener: EventListener): () => void {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
}

export function startMonitor(): () => void {
    if (timer) return stopMonitor;

    log.info(`Watching the download queue every ${IDLE_INTERVAL_MS / 1000}s, and every ${WATCHED_INTERVAL_MS / 1000}s while a browser is connected`);
    schedule(0);
    return stopMonitor;
}

export function stopMonitor(): void {
    if (timer) clearTimeout(timer);
    timer = null;
}

/** Only used by the tests and the dev-server reload path. */
export function resetMonitor(): void {
    stopMonitor();
    frameListeners.clear();
    eventListeners.clear();
    lastSnapshot = null;
    lastFrame = null;
    watchers = 0;
    currentInterval = 0;
}
