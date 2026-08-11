/**
 * Several searches at once, on top of a daemon that only knows about one.
 *
 * aMule holds a single search at a time: starting one throws away the previous
 * results, and `EC_OP_SEARCH_RESULTS` always answers for the latest. So the
 * *daemon's* search is whichever was started last, and every earlier search is
 * kept here as the snapshot it ended on — switchable, filterable, still good for
 * starting a download from (a hash does not go stale), and re-runnable with one
 * click when the user wants fresh numbers.
 *
 * The state lives in `useState`, so walking to the downloads page and back does
 * not throw away results the network took half a minute to collect.
 */

import type { SearchResult, SearchType } from '../../server/utils/amule-types';
import { mergeCollections } from '#shared/utils/mergeCollections';

export type SearchStatus = 'running' | 'done' | 'stopped' | 'failed';

export interface SearchSession {
    id: string;
    keyword: string;
    type: SearchType;
    /** Epoch ms the search was started, or last re-run. */
    startedAt: number;
    /** Epoch ms the results were last read. */
    updatedAt: number;
    status: SearchStatus;
    results: SearchResult[];
    error?: string;
}

/**
 * Results keep arriving after the request returns, and for a Kad search the
 * progress value stays 0 until the very end - so the poll stops when the number
 * of results stops growing rather than when the daemon says it is done.
 */
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 20;

/** Older tabs are dropped past this; the browser should not hold a session's worth of every search ever run. */
const MAX_SESSIONS = 12;

/**
 * How long a session waits before it is written to the server.
 *
 * A running search is polled every two seconds and grows by a few results each
 * time; writing on every poll would rewrite the whole store constantly for
 * results that are about to change again.
 */
const PERSIST_DELAY_MS = 4000;

let pollTimer: ReturnType<typeof setTimeout> | undefined;
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useSearches = () => {
    const api = useAmuleApi();
    const toast = useToast();

    const sessions = useState<SearchSession[]>('amule-searches', () => []);
    const activeId = useState<string | null>('amule-search-active', () => null);
    /** The search the daemon itself is holding, i.e. the one started last. */
    const currentId = useState<string | null>('amule-search-current', () => null);

    /** False until the stored searches have been read once this session. */
    const restored = useState<boolean>('amule-searches-restored', () => false);

    const active = computed(() => sessions.value.find(session => session.id === activeId.value) ?? null);
    /** True when the shown tab is the one the daemon can still be asked about. */
    const activeIsCurrent = computed(() => Boolean(activeId.value) && activeId.value === currentId.value);
    const running = computed(() => active.value?.status === 'running' && activeIsCurrent.value);

    /**
     * Writes a session to the server, at most once every few seconds per search.
     *
     * Best effort: the searches are still on screen if this fails, they simply do
     * not survive a reload, and saying so in a toast for something the user did
     * not ask for would be noise.
     */
    function persist(id: string, { now = false }: { now?: boolean } = {}) {
        if (import.meta.server) return;

        const existing = persistTimers.get(id);
        if (existing) clearTimeout(existing);

        const write = () => {
            persistTimers.delete(id);
            const session = sessions.value.find(entry => entry.id === id);
            if (!session) return;

            /*
             * A search with nothing in it is not worth a week of storage, and
             * restoring one is worse than not: the tab comes back empty, cannot
             * be resumed, and has to be closed by hand. A failed one is kept,
             * because the error is the thing worth seeing again.
             */
            if (session.results.length === 0 && session.status !== 'failed') return;

            api.storeSearch({ ...session }).catch(() => undefined);
        };

        if (now) {
            write();
            return;
        }

        persistTimers.set(id, setTimeout(write, PERSIST_DELAY_MS));
    }

    function patch(id: string, changes: Partial<SearchSession>) {
        const index = sessions.value.findIndex(session => session.id === id);
        if (index === -1) return;

        sessions.value[index] = { ...sessions.value[index]!, ...changes };
        persist(id);
    }

    /**
     * Reads back the searches the server kept, once per browser session.
     *
     * Anything already on screen wins: a search running right now is newer than
     * whatever was last written for it.
     */
    async function restore(): Promise<void> {
        if (import.meta.server || restored.value) return;
        restored.value = true;

        try {
            const response = await api.getStoredSearches();
            if (!response.success) return;

            const stored = (response.data?.searches ?? []) as SearchSession[];
            const known = new Set(sessions.value.map(session => session.id));

            // A search that was still running when the page was closed cannot be
            // resumed - the daemon has moved on - so it is restored as what it
            // actually is: the results that had arrived by then.
            const restoredSessions = stored
                .filter(session => !known.has(session.id))
                // Empty ones are dropped rather than shown: they cannot be
                // resumed, so the tab would exist only to be closed. Guarded here
                // as well as when writing, for anything stored by an older build.
                .filter(session => session.results.length > 0 || session.status === 'failed')
                .map(session => (session.status === 'running' ? { ...session, status: 'stopped' as const } : session));

            if (restoredSessions.length === 0) return;

            sessions.value = [...restoredSessions.reverse(), ...sessions.value];
            activeId.value ??= sessions.value.at(-1)?.id ?? null;
        } catch {
            // An unreachable store just means no history; the page works without it
        }
    }

    function stopPolling() {
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = undefined;
    }

    /**
     * Reads the results of the daemon's current search into its session.
     * Answers with how many there are, so the poll below can tell when the network
     * has stopped adding to them.
     */
    async function readResults(id: string): Promise<number> {
        try {
            const response = await api.getSearchResults();

            if (!response.success) {
                patch(id, { status: 'failed', error: response.error || 'Could not read the results' });
                return -1;
            }

            const session = sessions.value.find(entry => entry.id === id);
            if (!session) return -1;

            const fresh = response.data?.results ?? [];
            patch(id, {
                // Merged by hash: while a search is polled every two seconds, the
                // rows that were already there keep their objects and neither
                // re-render nor re-animate as new ones arrive below them.
                results: mergeCollections(session.results, fresh, result => result.hash || `#${result.resultNumber}`),
                updatedAt: Date.now(),
                error: undefined
            });

            return fresh.length;
        } catch (e: any) {
            patch(id, { status: 'failed', error: e?.message || 'Could not read the results' });
            return -1;
        }
    }

    function poll(id: string, attempt = 0, previousCount = -1) {
        pollTimer = setTimeout(async () => {
            // The user started another search, or closed this tab, while we waited
            if (currentId.value !== id) return;

            const count = await readResults(id);
            const settled = count > 0 && count === previousCount;

            if (count < 0 || settled || attempt + 1 >= MAX_POLLS) {
                stopPolling();
                if (sessions.value.find(session => session.id === id)?.status === 'running') {
                    patch(id, { status: 'done' });
                }
                if (count > 0) {
                    toast.add({ title: `Found ${count.toLocaleString()} results`, color: 'success' });
                }
                // Settled: worth keeping for the week rather than waiting out the debounce
                persist(id, { now: true });
                return;
            }

            poll(id, attempt + 1, count);
        }, POLL_INTERVAL_MS);
    }

    /** Starts a search in its own tab and makes it the one being watched. */
    async function start(type: SearchType, keyword: string): Promise<boolean> {
        const query = keyword.trim();
        if (!query) {
            toast.add({ title: 'Please enter search keywords', color: 'warning' });
            return false;
        }

        stopPolling();

        const id = `${Date.now().toString(36)}-${sessions.value.length}`;
        const session: SearchSession = {
            id,
            keyword: query,
            type,
            startedAt: Date.now(),
            updatedAt: 0,
            status: 'running',
            results: []
        };

        // Oldest first out, and never the tab being looked at
        const kept = sessions.value.length >= MAX_SESSIONS
            ? sessions.value.filter(entry => entry.id === activeId.value).concat(
                sessions.value.filter(entry => entry.id !== activeId.value).slice(-(MAX_SESSIONS - 2))
            )
            : sessions.value;

        sessions.value = [...kept, session];
        activeId.value = id;
        currentId.value = id;
        // Not written yet: it is stored once it has results, since a reload
        // mid-search cannot resume it anyway and an empty tab is only clutter

        try {
            const result = await api.search(type, query);
            if (!result.success) {
                patch(id, { status: 'failed', error: result.error || result.message || 'Search failed' });
                toast.add({ title: 'Search failed', description: result.error || result.message, color: 'error' });
                return false;
            }

            poll(id);
            return true;
        } catch (e: any) {
            patch(id, { status: 'failed', error: e?.message });
            toast.add({ title: 'Error', description: e?.message, color: 'error' });
            return false;
        }
    }

    /** Runs the same keywords again, in the tab that already holds them. */
    async function rerun(session: SearchSession): Promise<boolean> {
        stopPolling();

        patch(session.id, { status: 'running', startedAt: Date.now(), results: [], error: undefined });
        activeId.value = session.id;
        currentId.value = session.id;

        try {
            const result = await api.search(session.type, session.keyword);
            if (!result.success) {
                patch(session.id, { status: 'failed', error: result.error || result.message });
                toast.add({ title: 'Search failed', description: result.error || result.message, color: 'error' });
                return false;
            }

            poll(session.id);
            return true;
        } catch (e: any) {
            patch(session.id, { status: 'failed', error: e?.message });
            toast.add({ title: 'Error', description: e?.message, color: 'error' });
            return false;
        }
    }

    /** Asks the daemon to stop collecting, and keeps whatever arrived. */
    async function stop(): Promise<void> {
        const id = currentId.value;
        stopPolling();
        if (!id) return;

        patch(id, { status: 'stopped' });

        try {
            const result = await api.stopSearch();
            toast.add({
                title: result.success ? (result.message || 'Search stopped') : 'Could not stop the search',
                color: result.success ? 'warning' : 'error'
            });
        } catch (e: any) {
            toast.add({ title: 'Error', description: e?.message, color: 'error' });
        }

        await readResults(id);
    }

    /** Re-reads the daemon's current search on demand. */
    async function refresh(): Promise<void> {
        if (!currentId.value) return;
        await readResults(currentId.value);
    }

    function select(id: string) {
        activeId.value = id;
    }

    function close(id: string) {
        const index = sessions.value.findIndex(session => session.id === id);
        if (index === -1) return;

        sessions.value = sessions.value.filter(session => session.id !== id);

        // Closing a tab forgets it everywhere: the store is shared, so leaving it
        // behind would bring it back on the next reload
        const pending = persistTimers.get(id);
        if (pending) {
            clearTimeout(pending);
            persistTimers.delete(id);
        }
        api.forgetSearch(id).catch(() => undefined);

        if (currentId.value === id) {
            // Nothing left to poll: the daemon still holds these results, but no
            // tab is showing them any more
            stopPolling();
            currentId.value = null;
        }

        if (activeId.value === id) {
            const neighbour = sessions.value[index] ?? sessions.value[index - 1] ?? null;
            activeId.value = neighbour?.id ?? null;
        }
    }

    // The poll belongs to the session, not to the page: navigating away from
    // Search while a Kad query is still collecting should not abandon it. It only
    // has to be cleaned up when the app itself goes away.
    if (import.meta.client && import.meta.hot) {
        import.meta.hot.dispose(stopPolling);
    }

    return {
        sessions,
        activeId,
        restored,
        restore,
        active,
        activeIsCurrent,
        running,
        start,
        rerun,
        stop,
        refresh,
        select,
        close
    };
};
