/**
 * App-wide cache for the three collections every page reads: the download queue,
 * the active uploads and the shared files.
 *
 * Two problems this solves:
 *
 *  * **Flashing lists.** Each page used to own its data, so navigating to it
 *    started from "loading" and the list appeared, vanished and reappeared. The
 *    state lives in `useState` here, so a page that has been visited once always
 *    has something to render immediately.
 *  * **Waiting for the daemon.** The feeds keep refreshing in the background
 *    (see `app/plugins/amule-prefetch.client.ts`), so opening Downloads or
 *    Uploads shows data that is already a few seconds old at worst instead of
 *    starting a round trip.
 *
 * The cadence depends on whether the page showing a feed is open: a page calls
 * `focus()` and gets the fast interval for as long as it is mounted, everything
 * else polls slowly. The daemon serves a single EC connection, so nothing here
 * ever runs two fetches of the same feed at once, and polling stops while the
 * tab is hidden.
 */

import type { ApiResponse } from '#shared/types/api';
import type { Download, SharedFile, Upload } from '../../server/utils/amule-types';
import { mergeCollections } from '#shared/utils/mergeCollections';

export type FeedName = 'downloads' | 'uploads' | 'shared';

interface FeedDefinition {
    /** Interval used while a page that shows this feed is open. */
    focusMs: number;
    /** Interval used when no page shows it, i.e. the prefetch cadence. */
    idleMs: number;
    label: string;
    /**
     * What makes an entry the same entry between two reads. Used to merge a fresh
     * read into the list on screen instead of replacing it — see
     * `mergeCollections` for why that matters.
     */
    keyOf: (item: any) => string;
}

/**
 * Downloads and uploads are what the user watches move, so they stay warm at 10
 * seconds in the background. The shared file list is long and changes rarely, so
 * it is refreshed once a minute.
 */
export const FEED_DEFINITIONS: Record<FeedName, FeedDefinition> = {
    downloads: {
        focusMs: 3000,
        idleMs: 10_000,
        label: 'downloads',
        keyOf: (item: Download) => item.hash
    },
    uploads: {
        // An upload has no id of its own: it is one peer transferring one file.
        focusMs: 3000,
        idleMs: 10_000,
        label: 'uploads',
        keyOf: (item: Upload) => `${item.fileHash}@${item.userIp}:${item.userPort}`
    },
    shared: {
        focusMs: 15_000,
        idleMs: 60_000,
        label: 'shared files',
        keyOf: (item: SharedFile) => item.hash || item.fullPath
    }
};

/** How long the first shared-files read waits, so it does not land with the others. */
const SHARED_WARMUP_DELAY_MS = 1500;

/**
 * How long one read may take before it is abandoned.
 *
 * Generous, because the daemon can genuinely be slow with a long shared list.
 * The point is only that a read always ends: a browser that freezes a
 * background tab drops the connection without failing the request, and a poll
 * that waits forever on a promise like that never runs again - which is why a
 * tab left idle used to come back stuck on its last error until it was
 * reloaded.
 */
const READ_TIMEOUT_MS = 20_000;

/**
 * Per-feed bookkeeping that must not be reactive: in-flight guards and the
 * number of mounted pages interested in the feed. Client-only, one map per
 * browser tab.
 */
interface FeedRuntime {
    inFlight: boolean;
    /** How many mounted components are showing this feed right now. */
    focusCount: number;
    /**
     * When the last attempt *started*. `updatedAt` only moves once a fetch
     * settles, so without this a second trigger arriving while the first is
     * still in flight (the startup warm-up and the visibility check can land
     * together) would fetch again the moment the first one finished.
     */
    lastAttemptAt: number;
    /** Counts attempts, so a late reply can tell it has been superseded. */
    generation: number;
}

/**
 * One runtime map per browser tab.
 *
 * It hangs off `globalThis` rather than being a module-level `const` because the
 * dev server can hand the same module to more than one chunk: with a map per
 * module copy the guards below stop being shared and the feeds double-fetch.
 * On the server every request gets a throwaway map — nothing there polls, and a
 * shared one would leak one request's timings into the next.
 */
function runtimeStore(): Map<FeedName, FeedRuntime> {
    if (import.meta.server) return new Map();

    const global = globalThis as typeof globalThis & { __amuleFeedRuntime?: Map<FeedName, FeedRuntime> };
    global.__amuleFeedRuntime ??= new Map();
    return global.__amuleFeedRuntime;
}

function runtimeFor(name: FeedName): FeedRuntime {
    const store = runtimeStore();
    let entry = store.get(name);
    if (!entry) {
        entry = { inFlight: false, focusCount: 0, lastAttemptAt: 0, generation: 0 };
        store.set(name, entry);
    }
    return entry;
}

/** Feed state, shared by every component that asks for the same feed. */
function feedState<T>(name: FeedName) {
    return {
        items: useState<T[]>(`amule-feed-${name}`, () => []),
        // True only until the first attempt settles. A cached feed never goes
        // back to loading, which is what keeps a revisit from flashing.
        loading: useState<boolean>(`amule-feed-${name}-loading`, () => true),
        error: useState<string | null>(`amule-feed-${name}-error`, () => null),
        /** Epoch ms of the last settled attempt, 0 before the first one. */
        updatedAt: useState<number>(`amule-feed-${name}-updated`, () => 0)
    };
}

function fetcherFor(name: FeedName): (signal: AbortSignal) => Promise<ApiResponse<any[]>> {
    const api = useAmuleApi();
    switch (name) {
        case 'downloads': return signal => api.getDownloads({ signal });
        case 'uploads': return signal => api.getUploads({ signal });
        // /api/amule/shared answers with an object, so it is unwrapped here and
        // every feed downstream deals with a plain array.
        case 'shared': return async signal => {
            const result = await api.getSharedFiles({ signal });
            return { ...result, data: result.data?.sharedFiles ?? [] };
        };
    }
}

/** How long this feed may go without a refresh, given who is watching it. */
export function feedIntervalMs(name: FeedName): number {
    const definition = FEED_DEFINITIONS[name];
    return runtimeFor(name).focusCount > 0 ? definition.focusMs : definition.idleMs;
}

export interface AmuleFeed<T> {
    items: Ref<T[]>;
    loading: Ref<boolean>;
    error: Ref<string | null>;
    updatedAt: Ref<number>;
    /** True once data has been read at least once, successfully or not. */
    settled: ComputedRef<boolean>;
    refresh: (options?: { force?: boolean }) => Promise<void>;
    /**
     * Keeps the fast interval while the calling component is alive. Pass a ref or
     * getter to tie it to a toggle (an "auto refresh" switch, say); the feed then
     * drops back to the background cadence while that is false.
     */
    focus: (active?: MaybeRefOrGetter<boolean>) => void;
}

export function useAmuleFeed<T = unknown>(name: FeedName): AmuleFeed<T> {
    const state = feedState<T>(name);
    const fetcher = fetcherFor(name);
    const definition = FEED_DEFINITIONS[name];

    const settled = computed(() => state.updatedAt.value > 0);

    async function refresh({ force = false }: { force?: boolean } = {}) {
        const entry = runtimeFor(name);
        // A single EC connection serves every request: overlapping fetches only
        // queue behind each other and make the whole UI slower. The guard is
        // given up on once the read is past any time it could still return in,
        // so a request the browser abandoned without failing cannot leave the
        // feed permanently silent.
        if (entry.inFlight && Date.now() - entry.lastAttemptAt < READ_TIMEOUT_MS * 2) return;

        const interval = feedIntervalMs(name);
        const since = Math.max(state.updatedAt.value, entry.lastAttemptAt);
        if (!force && since > 0 && Date.now() - since < interval) return;

        entry.inFlight = true;
        entry.lastAttemptAt = Date.now();
        // Which attempt this is. An abandoned read that comes back late has been
        // overtaken by the one that replaced it, and must not write anything.
        const attempt = ++entry.generation;
        const current = () => entry.generation === attempt;

        try {
            const result = await fetcher(AbortSignal.timeout(READ_TIMEOUT_MS));
            if (!current()) return;

            if (result.success) {
                // Merged, not assigned: an unchanged read leaves the ref alone, so
                // the rows on screen neither re-render nor re-animate.
                state.items.value = mergeCollections(
                    state.items.value as object[],
                    (result.data ?? []) as object[],
                    definition.keyOf
                ) as T[];
                state.error.value = null;
            } else {
                // Keep the last list on screen and report why it is not moving;
                // replacing it with an error box is the flicker users noticed.
                state.error.value = result.error || `Failed to load ${definition.label}`;
            }
        } catch (e: any) {
            if (!current()) return;
            state.error.value = e?.message || `Failed to load ${definition.label}`;
        } finally {
            if (current()) {
                entry.inFlight = false;
                state.loading.value = false;
                state.updatedAt.value = Date.now();
            }
        }
    }

    function focus(active: MaybeRefOrGetter<boolean> = true) {
        if (import.meta.server) return;

        const entry = runtimeFor(name);
        let held = false;

        const acquire = () => {
            if (held) return;
            held = true;
            entry.focusCount += 1;
            // Whatever is cached is shown right away; this only tops it up.
            refresh();
        };

        const release = () => {
            if (!held) return;
            held = false;
            entry.focusCount = Math.max(0, entry.focusCount - 1);
        };

        watch(() => toValue(active), on => (on ? acquire() : release()), { immediate: true });
        onScopeDispose(release);
    }

    return { ...state, settled, refresh, focus };
}

/**
 * Feeds a snapshot that arrived over the live socket into the same state the HTTP
 * poll writes to.
 *
 * The queue used to have two sources — this push and the poll — and a computed
 * that picked whichever looked usable. Every time the choice flipped the entire
 * list was replaced, which is what made rows (idle ones most visibly, since
 * nothing else about them ever changes) vanish and come back every few seconds.
 * There is one list now; the socket is just the faster way to fill it.
 *
 * Marking the feed fresh here also throttles the poll: while pushes keep
 * arriving the timer below finds the feed up to date and asks the daemon for
 * nothing, which leaves its single EC connection to the pages.
 */
export function applyLiveDownloads(list: Download[]): void {
    const state = feedState<Download>('downloads');

    state.items.value = mergeCollections(
        state.items.value as object[],
        list as object[],
        FEED_DEFINITIONS.downloads.keyOf
    ) as Download[];
    state.error.value = null;
    state.loading.value = false;
    state.updatedAt.value = Date.now();
}

export const useDownloadsFeed = () => useAmuleFeed<Download>('downloads');
export const useUploadsFeed = () => useAmuleFeed<Upload>('uploads');
export const useSharedFilesFeed = () => useAmuleFeed<SharedFile>('shared');

/**
 * Drives every feed from one timer.
 *
 * Called by the client plugin, so the loops exist for the whole session rather
 * than being torn down and restarted on every navigation.
 */
export function startFeedPrefetch() {
    const feeds = {
        downloads: useAmuleFeed<Download>('downloads'),
        uploads: useAmuleFeed<Upload>('uploads'),
        shared: useAmuleFeed<SharedFile>('shared')
    } satisfies Record<FeedName, AmuleFeed<any>>;

    const names = Object.keys(feeds) as FeedName[];

    /** One tick per second decides which feeds are due; cheaper than one timer each. */
    const timer = setInterval(() => {
        if (document.visibilityState !== 'visible') return;

        for (const name of names) {
            const feed = feeds[name];
            if (Date.now() - feed.updatedAt.value >= feedIntervalMs(name)) {
                feed.refresh();
            }
        }
    }, 1000);

    // A hidden tab stops polling entirely, and a browser that froze it may have
    // dropped the connections underneath. Coming back is therefore a forced
    // read: not "refresh if due", which a stale `updatedAt` can talk out of
    // running, but "go and ask now". Same on regaining the network, since the
    // error on screen is usually from the moment it went away.
    const catchUp = () => {
        if (document.visibilityState !== 'visible') return;
        for (const name of names) feeds[name].refresh({ force: true });
    };
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('online', catchUp);
    // A frozen tab is resumed by a pageshow rather than a visibility change when
    // it comes back out of the back/forward cache.
    window.addEventListener('pageshow', catchUp);

    // First fill: the queue and the uploads matter immediately.
    feeds.downloads.refresh();
    feeds.uploads.refresh();

    // The shared list is the heaviest of the three and the daemon serves a single
    // EC connection, so its first read is held back by pre-dating its last
    // attempt: the tick above then picks it up once that offset has elapsed. A
    // timer of its own would race the tick and fetch the list twice.
    runtimeFor('shared').lastAttemptAt =
        Date.now() - FEED_DEFINITIONS.shared.idleMs + SHARED_WARMUP_DELAY_MS;

    return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', catchUp);
        window.removeEventListener('online', catchUp);
        window.removeEventListener('pageshow', catchUp);
    };
}
