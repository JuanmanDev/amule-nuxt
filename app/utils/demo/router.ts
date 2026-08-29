/**
 * Maps the `/api/...` requests the pages make onto the demo daemon.
 *
 * Kept as a plain function of (method, path, body, query) so it can be tested
 * without a browser, and so the plugin that wires it into `$fetch` stays a few
 * lines. Every response is the same `ApiResponse` envelope the Nitro handlers
 * return - the pages never see a difference.
 *
 * Whatever is not simulated answers honestly with `success: false` and says why,
 * which the pages already know how to show.
 */

import type { ApiResponse } from '#shared/types/api';
import { splitLinks } from '#shared/utils/addLinks';
import type { DemoDaemon } from './simulator';
import mcpInfo from './mcpInfo.json';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface DemoRequest {
    method: HttpMethod;
    /** Path without the base URL, e.g. `/api/amule/downloads`. */
    path: string;
    body?: any;
    query: Record<string, string>;
}

/** What the browser-side MCP endpoint and the push relay have to say in a demo. */
export const DEMO_UNAVAILABLE = {
    mcp: 'The MCP endpoint needs the aMule Nuxt server; the demo is a static page',
    push: 'Web Push needs the aMule Nuxt server; the demo is a static page',
    assistantRelay: 'Remote assistant endpoints are relayed through the aMule Nuxt server, which the demo does not have. The in-browser model still works.'
};

const VALID_PRIORITIES = new Set(['Auto', 'High', 'Normal', 'Low']);
const SEARCH_TYPES = new Set(['Global', 'Kad', 'Local']);
const AUTO_DURATIONS = new Set(['1h', '1d', '1w', '1m', 'forever']);

/** Splits `/api/amule/downloads/ABC/pause` into its segments, decoded. */
function segments(path: string): string[] {
    return path.split('?')[0]!.split('/').filter(Boolean).map(part => {
        try { return decodeURIComponent(part); } catch { return part; }
    });
}

export function isDemoApiPath(path: string): boolean {
    return /^\/api\//.test(path) || path === '/mcp';
}

export function handleDemoRequest(daemon: DemoDaemon, request: DemoRequest): ApiResponse<any> {
    const parts = segments(request.path);
    if (parts[0] === 'mcp') return { success: false, error: DEMO_UNAVAILABLE.mcp };
    if (parts[0] !== 'api') return { success: false, error: `No such route: ${request.path}` };

    const [, area, ...rest] = parts;
    try {
        switch (area) {
            case 'amule': return amule(daemon, request, rest);
            case 'push': return { success: false, error: DEMO_UNAVAILABLE.push };
            case 'assistant': return { success: false, error: DEMO_UNAVAILABLE.assistantRelay };
            case 'mcp-info': {
                // The endpoint itself does not exist here, but what it would offer
                // does: the snapshot is what a real server answered, checked
                // against server/mcp/tools by test/demo.test.ts so it cannot drift.
                const base = typeof window === 'undefined' ? '/' : window.location.origin + (useRuntimeConfig().app.baseURL || '/');
                return { success: true, data: { ...mcpInfo, version: 'demo', route: '/mcp', url: `${base.replace(/\/$/, '')}/mcp` } };
            }
            case 'diagnostics':
                return {
                    success: true,
                    data: {
                        appVersion: 'demo',
                        environment: 'production',
                        logLevel: 2,
                        logLevelSource: 'environment',
                        nodeVersion: 'none (static demo)',
                        uptime: Math.floor(performance.now() / 1000),
                        amule: { host: 'simulated', port: '—' }
                    }
                };
            default:
                return { success: false, error: `No such route: ${request.path}` };
        }
    } catch (error: any) {
        return { success: false, error: error?.message || 'The demo daemon failed' };
    }
}

function amule(daemon: DemoDaemon, { method, body, query }: DemoRequest, parts: string[]): ApiResponse<any> {
    const [head, second, third] = parts;
    const ok = <T>(data?: T, message?: string): ApiResponse<T> => ({ success: true, data, message });

    switch (head) {
        case 'status': return ok(daemon.status());
        case 'statistics':
            if (second === 'history') return ok(daemon.getSpeedHistory(Number(query.minutes ?? 30) || 30));
            if (second === 'tree') return ok(daemon.getStatsTree());
            return ok(daemon.getStatistics());
        case 'logs': return ok(daemon.getLogs());
        case 'serverinfo': return ok(daemon.getServerInfo());
        case 'uploads': return ok(daemon.getUploads());
        case 'shared': return ok({ sharedFiles: daemon.getSharedFiles() });
        case 'preferences':
            return method === 'GET' ? ok(daemon.getPreferences()) : daemon.setPreferences(body ?? {});
        case 'bandwidth':
            if (method === 'GET') return ok(daemon.getBandwidthLimits());
            if (body?.uploadLimit === undefined || body?.downloadLimit === undefined) {
                return { success: false, error: 'Both uploadLimit and downloadLimit are required' };
            }
            return daemon.setBandwidthLimits(body);
        case 'connect': return daemon.connect(body?.network);
        case 'disconnect': return daemon.disconnect(body?.network);
        case 'kad': return daemon.kad(body?.action, body ?? {});

        case 'downloads': {
            if (!second) return ok(daemon.getDownloads());
            if (second === 'add') {
                const raw: string[] = Array.isArray(body?.links) ? body.links : typeof body?.link === 'string' ? [body.link] : [];
                const links = raw.flatMap(entry => (typeof entry === 'string' ? splitLinks(entry) : []));
                if (links.length === 0) return { success: false, error: 'At least one link is required' };
                const data = daemon.addLinks(links);
                return {
                    success: data.rejected === 0,
                    message: `Added ${data.added} of ${data.results.length} links`,
                    error: data.rejected > 0
                        ? data.results.filter(result => result.status === 'rejected').map(result => result.message).join('; ')
                        : undefined,
                    data
                };
            }
            switch (third) {
                case 'pause': return daemon.pause(second);
                case 'resume': return daemon.resume(second);
                case 'cancel': return daemon.cancel(second);
                case 'priority':
                    if (!body?.priority) return { success: false, error: 'Priority is required' };
                    if (!VALID_PRIORITIES.has(body.priority)) {
                        return { success: false, error: `Invalid priority. Must be one of: ${[...VALID_PRIORITIES].join(', ')}` };
                    }
                    return daemon.setPriority(second, body.priority);
            }
            break;
        }

        case 'search': {
            if (!second) {
                if (!body?.type) return { success: false, error: 'Search type is required' };
                if (!body?.keyword) return { success: false, error: 'Search keyword is required' };
                if (!SEARCH_TYPES.has(body.type)) return { success: false, error: `Invalid search type. Must be one of: ${[...SEARCH_TYPES].join(', ')}` };
                return daemon.search(body.type, String(body.keyword));
            }
            if (second === 'results') return ok(daemon.getSearchResults());
            if (second === 'stop') return daemon.stopSearch();
            if (second === 'download') {
                const identifier = typeof body?.hash === 'string' ? body.hash : body?.resultNumber;
                if (identifier === undefined) return { success: false, error: 'A file hash or result number is required' };
                return daemon.downloadFromSearch(identifier);
            }
            if (second === 'sessions') {
                if (method === 'GET') return ok(daemon.listSearchSessions());
                if (method === 'DELETE' && third) {
                    const removed = daemon.removeSearchSession(third);
                    return { success: true, message: removed ? 'Search forgotten' : 'That search was not stored' };
                }
                if (typeof body?.id !== 'string' || !body.id.trim()) return { success: false, error: 'A search needs an id' };
                if (typeof body?.keyword !== 'string' || !body.keyword.trim()) return { success: false, error: 'A search needs its keywords' };
                if (!SEARCH_TYPES.has(body?.type)) return { success: false, error: 'A search needs a network of Global, Kad or Local' };
                const now = Date.now();
                return ok(daemon.saveSearchSession({
                    id: body.id.trim().slice(0, 64),
                    keyword: body.keyword.trim().slice(0, 200),
                    type: body.type,
                    startedAt: Number(body.startedAt) || now,
                    updatedAt: Number(body.updatedAt) || now,
                    status: ['running', 'done', 'stopped', 'failed'].includes(body?.status) ? body.status : 'done',
                    results: Array.isArray(body?.results) ? body.results : [],
                    error: typeof body?.error === 'string' ? body.error.slice(0, 500) : undefined
                }));
            }
            if (second === 'auto') {
                if (!third) {
                    if (method === 'GET') {
                        const searches = daemon.listAutoSearches().map(({ results, ...rest }) => ({ ...rest, resultCount: results.length }));
                        return ok({ searches });
                    }
                    const keyword = typeof body?.keyword === 'string' ? body.keyword.trim().slice(0, 200) : '';
                    if (!keyword) return { success: false, error: 'An automatic search needs its keywords' };
                    const networks = Array.isArray(body?.networks) ? [...new Set(body.networks as string[])].filter(n => SEARCH_TYPES.has(n)) : [];
                    if (networks.length === 0) return { success: false, error: 'Pick at least one network of Kad, Global or Local' };
                    if (!AUTO_DURATIONS.has(body?.duration)) return { success: false, error: `The duration must be one of: ${[...AUTO_DURATIONS].join(', ')}` };
                    return ok({ search: daemon.createAutoSearch({ keyword, networks: networks as any, duration: body.duration, intervalMs: Number(body?.intervalMs) || undefined }) });
                }
                const action = parts[3];
                if (action === 'stop' || action === 'resume') {
                    const search = action === 'stop' ? daemon.stopAutoSearch(third) : daemon.resumeAutoSearch(third);
                    return search ? ok({ search }) : { success: false, error: 'No automatic search with that id' };
                }
                if (method === 'DELETE') {
                    return daemon.removeAutoSearch(third)
                        ? { success: true, message: 'Automatic search removed' }
                        : { success: false, error: 'No automatic search with that id' };
                }
                const search = daemon.getAutoSearch(third);
                return search ? ok({ search }) : { success: false, error: 'No automatic search with that id' };
            }
            break;
        }

        case 'servers': {
            if (!second) return ok(daemon.getServers());
            if (second === 'add') {
                if (!body?.address) return { success: false, error: 'Server address (ip:port) is required' };
                return daemon.addServer(String(body.address).trim(), body.name ? String(body.name).trim() : undefined);
            }
            if (second === 'connect') {
                if (!body?.address) return { success: false, error: 'Server address (ip:port) is required' };
                return daemon.connectToServer(String(body.address).trim());
            }
            if (second === 'update') return daemon.updateServerList(body?.url);
            if (method === 'DELETE') return daemon.removeServer(second);
            break;
        }
    }

    return { success: false, error: `No such route: /api/amule/${parts.join('/')}` };
}
