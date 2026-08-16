/**
 * The loop that actually runs the automatic searches.
 *
 * One pass at a time, because the daemon holds a single search: starting a new
 * one throws the previous results away. Each pass starts the search on its
 * network, reads results until they stop growing, stops the search, and merges
 * what arrived into the accumulated list.
 *
 * The runner steps aside for people: while a manual search was started
 * recently, due passes wait. An automatic search is in no hurry — its whole
 * premise is that it has hours.
 */

import { useLogger } from './logger';
import { getAmuleClient } from './getAmuleClient';
import { manualSearchActive } from './searchActivity';
import {
    listAutoSearches,
    getAutoSearch,
    patchAutoSearch,
    mergeResults,
    type AutoSearch
} from './autoSearchStore';

const log = useLogger('auto-search');

/** How often the runner looks for a due pass. */
const TICK_MS = 20 * 1000;

/** How the runner reads a pass's results: every few seconds until the count stops growing. */
const RESULT_POLL_MS = 5 * 1000;
const RESULT_MAX_POLLS = 18;

let tickTimer: ReturnType<typeof setInterval> | null = null;
let runInProgress = false;
let stopped = false;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms).unref?.());
}

/** The network this pass asks, cycling so every pass covers a different one. */
export function networkForRun(search: AutoSearch): AutoSearch['networks'][number] {
    return search.networks[search.runs % search.networks.length]!;
}

async function runPass(search: AutoSearch): Promise<void> {
    const network = networkForRun(search);
    const client = getAmuleClient();

    const started = await client.search(network, search.keyword);
    if (!started.success) {
        throw new Error(started.message || `Could not start the ${network} search`);
    }

    // Same settling heuristic as the interactive page: a Kad search reports no
    // usable progress, so "the count stopped growing" is the end signal.
    let previousCount = -1;
    let fresh: Awaited<ReturnType<typeof client.getSearchResults>>['results'] = [];

    for (let attempt = 0; attempt < RESULT_MAX_POLLS && !stopped; attempt += 1) {
        await sleep(RESULT_POLL_MS);

        const read = await client.getSearchResults();
        fresh = read.results;

        if (fresh.length > 0 && fresh.length === previousCount) break;
        previousCount = fresh.length;
    }

    // Best effort: a search left running only costs the daemon idle chatter,
    // and the next pass replaces it anyway.
    await client.stopSearch().catch(() => undefined);

    // Re-read before writing: the search may have been stopped or deleted
    // while this pass was collecting.
    const current = await getAutoSearch(search.id);
    if (!current) return;

    const added = mergeResults(current, fresh);
    const now = Date.now();
    const finished = current.endsAt !== null && now >= current.endsAt;

    await patchAutoSearch(search.id, {
        results: current.results,
        runs: current.runs + 1,
        newLastRun: added,
        lastRunAt: now,
        nextRunAt: now + current.intervalMs,
        status: current.status === 'active' && finished ? 'finished' : current.status,
        lastError: undefined
    });

    log.info(`"${search.keyword}" on ${network}: ${fresh.length} results, ${added} new (${current.results.length} total)`);
}

async function tick(): Promise<void> {
    if (runInProgress || stopped) return;
    if (manualSearchActive()) return;

    const now = Date.now();
    const all = await listAutoSearches();

    // Expire on time even between passes, so a finished search does not show
    // as active until its next tick happens to run.
    for (const search of all) {
        if (search.status === 'active' && search.endsAt !== null && now >= search.endsAt) {
            await patchAutoSearch(search.id, { status: 'finished' });
        }
    }

    const due = all.find(search => search.status === 'active'
        && (search.endsAt === null || now < search.endsAt)
        && search.nextRunAt <= now);
    if (!due) return;

    runInProgress = true;
    try {
        await runPass(due);
    } catch (e: any) {
        log.warn(`Pass for "${due.keyword}" failed`, e);
        await patchAutoSearch(due.id, {
            lastError: e?.message || 'The search pass failed',
            // Failed passes still wait the interval: a daemon that is down now
            // is not helped by being asked again in twenty seconds.
            nextRunAt: Date.now() + due.intervalMs
        }).catch(() => undefined);
    } finally {
        runInProgress = false;
    }
}

export function startAutoSearchRunner(): void {
    if (tickTimer) return;
    stopped = false;

    tickTimer = setInterval(() => { void tick(); }, TICK_MS);
    tickTimer.unref?.();
    log.info('Automatic search runner started');
}

export function stopAutoSearchRunner(): void {
    stopped = true;
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
}
