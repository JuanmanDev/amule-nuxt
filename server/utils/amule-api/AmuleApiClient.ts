/**
 * Client for amuleapi, the REST daemon that ships with aMule 3.1.
 *
 * amuleapi speaks to amuled as an ordinary EC client and serves `/api/v1/*`
 * over HTTP. Where it is running, it is the better link: typed, locale-free
 * JSON, ETag-revalidated lists, and data EC structurally cannot send (the
 * per-part map, media metadata, ETA, complete-source counts on search hits).
 * Where it is not - any aMule before 3.1, or a 3.1 without amuleapi enabled -
 * the EC client in `server/utils/amule-ec` keeps answering. The choice between
 * the two is made per call by `AmuleBackend`; this file only knows HTTP.
 *
 * Two error classes matter to the caller:
 * - `AmuleApiUnavailableError`: amuleapi itself cannot answer (down, wrong
 *   password, rate limited, its EC link to amuled not up). Falling back to EC
 *   is the right reaction.
 * - `AmuleApiError`: amuleapi answered and said no (404, a daemon rejection).
 *   That is the answer; asking EC the same question would not change it.
 *
 * Reference: aMule `docs/api/REFERENCE.md` (tag 3.1.0).
 */

import { AmuleConnectionError } from '../amule-types';
import { useLogger } from '../logger';
import type {
    ApiDownload,
    ApiErrorEnvelope,
    ApiHealth,
    ApiLoginResponse,
    ApiLogLines,
    ApiPatch,
    ApiPeerClient,
    ApiPreferences,
    ApiResultsEnvelope,
    ApiSearch,
    ApiSearchResults,
    ApiServer,
    ApiServerInfoLog,
    ApiSharedFile,
    ApiStatsNode,
    ApiStatus,
    ApiVersion
} from './types';

const log = useLogger('amuleapi');

/** After a transport failure: long enough to stop hammering, short enough to recover on its own. */
const DOWN_COOLDOWN_MS = 30_000;
/**
 * After a rejected password. amuleapi locks an IP out for five minutes after
 * five failed logins in a minute, so retrying faster than this could turn a
 * typo in the config into a lockout that also blocks the browser Web UI.
 */
const BAD_CREDENTIALS_COOLDOWN_MS = 5 * 60_000;
/** amuleapi is up but its own EC link to amuled is not (cold start, amuled restart). */
const EC_UNAVAILABLE_COOLDOWN_MS = 5_000;
/** Refresh the JWT before it actually expires, so a request never races it. */
const TOKEN_SAFETY_MARGIN_S = 60;
/** Assumed lifetime of a token whose login answer carried no expiry. */
const FALLBACK_TOKEN_LIFETIME_S = 3600;
/** `limit` defaults to 100 items; this is the documented "everything". */
const ALL = 1_000_000_000;

export interface AmuleApiConfig {
    host: string;
    port: number;
    password: string;
    /** Per-request timeout, ms. */
    timeoutMs?: number;
}

/** amuleapi answered with an error envelope - a real answer, not an outage. */
export class AmuleApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message);
        this.name = 'AmuleApiError';
    }
}

/** amuleapi could not answer at all. The caller should fall back to EC. */
export class AmuleApiUnavailableError extends AmuleConnectionError {
    constructor(message: string, public status = 0, public code = 'unavailable') {
        super(message);
        this.name = 'AmuleApiUnavailableError';
    }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    /** Revalidate with the last ETag and reuse the cached body on a 304. */
    revalidate?: boolean;
    /** Login and health checks must not recurse into authentication. */
    anonymous?: boolean;
    /**
     * A diagnostic look: ignores the cooldown and leaves it alone either way,
     * so opening the diagnostics page neither resets nor extends it.
     */
    probe?: boolean;
}

interface CachedBody {
    etag: string;
    body: unknown;
}

/** "ECONNREFUSED" reads better in a banner than undici's "fetch failed". */
function transportReason(error: any): string {
    if (error?.name === 'TimeoutError') return 'timed out';
    return error?.cause?.code || error?.message || String(error);
}

export class AmuleApiClient {
    readonly host: string;
    readonly port: number;
    private readonly base: string;
    private readonly password: string;
    private readonly timeoutMs: number;

    private token: string | null = null;
    private tokenExpiresAt = 0;
    private loginInFlight: Promise<void> | null = null;
    /** Role granted at login; a guest token cannot mutate anything. */
    role: string | null = null;

    private downUntil = 0;
    private downReason = '';
    private loggedDown = false;

    /** Last validator and body per GET URL, for If-None-Match. */
    private readonly etags = new Map<string, CachedBody>();

    constructor(config: AmuleApiConfig) {
        this.host = config.host;
        this.port = config.port;
        this.base = `http://${config.host}:${config.port}/api/v1`;
        this.password = config.password;
        this.timeoutMs = config.timeoutMs ?? 8000;
    }

    /** amuleapi has no anonymous read access, so no password means "not configured". */
    get enabled(): boolean {
        return Boolean(this.password);
    }

    /** False while a recent failure says not to try yet. */
    get available(): boolean {
        return this.enabled && Date.now() >= this.downUntil;
    }

    /** Why the client is cooling down, for diagnostics; empty while available. */
    get unavailableReason(): string {
        return this.available ? '' : this.downReason || 'not configured';
    }

    get address(): string {
        return `${this.host}:${this.port}`;
    }

    // ---------------------------------------------------------------- system

    /** Liveness plus amuleapi's own view of its EC link. Needs no login. */
    health(): Promise<ApiHealth> {
        return this.json<ApiHealth>('GET', '/health', { anonymous: true, probe: true });
    }

    /**
     * Versions of amuleapi and the amuled behind it. Update availability is
     * only told to an authenticated caller; anonymously the identity fields
     * still come back, which is what a cooling-down client asks for so a
     * diagnostics refresh cannot spend a login attempt.
     */
    version(authenticated = true): Promise<ApiVersion> {
        return this.json<ApiVersion>('GET', '/version', { anonymous: !authenticated, probe: true });
    }

    status(): Promise<ApiStatus> {
        return this.json<ApiStatus>('GET', '/status');
    }

    // ------------------------------------------------------------- downloads

    async listDownloads(): Promise<ApiDownload[]> {
        // `active` is the default and hides finished files awaiting a clear,
        // which the EC queue reports; `all` keeps the two lists the same.
        const body = await this.json<{ downloads: ApiDownload[] }>('GET', '/downloads', {
            query: { status: 'all', limit: ALL },
            revalidate: true
        });
        return body.downloads ?? [];
    }

    getDownload(hash: string): Promise<ApiDownload> {
        return this.json<ApiDownload>('GET', `/downloads/${hash.toLowerCase()}`);
    }

    patchDownload(hash: string, patch: Record<string, unknown>): Promise<ApiDownload> {
        return this.json<ApiDownload>('PATCH', `/downloads/${hash.toLowerCase()}`, { body: patch });
    }

    async deleteDownload(hash: string): Promise<void> {
        await this.send('DELETE', `/downloads/${hash.toLowerCase()}`);
    }

    async clearCompleted(hash: string): Promise<void> {
        await this.send('POST', '/downloads_clear_completed', { body: { hash: hash.toLowerCase() } });
    }

    addDownloads(links: string[]): Promise<ApiResultsEnvelope> {
        return this.json<ApiResultsEnvelope>('POST', '/downloads', { body: { links } });
    }

    async downloadComments(hash: string): Promise<{ total: number; kad_comment_lookup_running: boolean; comments: Array<{ username: string; filename: string; rating: number; comment: string }> }> {
        return this.json('GET', `/downloads/${hash.toLowerCase()}/comments`);
    }

    async downloadFilenames(hash: string): Promise<Array<{ filename: string; source_count: number }>> {
        const body = await this.json<{ filenames: Array<{ filename: string; source_count: number }> }>('GET', `/downloads/${hash.toLowerCase()}/filenames`);
        return body.filenames ?? [];
    }

    // ---------------------------------------------------------------- shared

    async listShared(): Promise<ApiSharedFile[]> {
        const body = await this.json<{ shared: ApiSharedFile[] }>('GET', '/shared', {
            query: { limit: ALL },
            revalidate: true
        });
        return body.shared ?? [];
    }

    getShared(hash: string): Promise<ApiSharedFile> {
        return this.json<ApiSharedFile>('GET', `/shared/${hash.toLowerCase()}`);
    }

    // --------------------------------------------------------------- clients

    async listClients(activity?: 'uploading' | 'downloading' | 'active'): Promise<ApiPeerClient[]> {
        const body = await this.json<{ clients: ApiPeerClient[] }>('GET', '/clients', {
            query: { activity, limit: ALL }
        });
        return body.clients ?? [];
    }

    // --------------------------------------------------------------- servers

    async listServers(): Promise<ApiServer[]> {
        const body = await this.json<{ servers: ApiServer[] }>('GET', '/servers', { query: { limit: ALL } });
        return body.servers ?? [];
    }

    async addServer(address: string, name?: string): Promise<void> {
        await this.send('POST', '/servers', { body: name ? { address, name } : { address } });
    }

    async connectServer(address: string): Promise<void> {
        await this.send('POST', `/servers/by-address/${address}/connect`);
    }

    async removeServer(address: string): Promise<void> {
        await this.send('DELETE', `/servers/by-address/${address}`);
    }

    async updateServerList(url: string): Promise<void> {
        await this.send('POST', '/servers_update', { body: { url } });
    }

    // ----------------------------------------------------------- preferences

    preferences(): Promise<ApiPreferences> {
        return this.json<ApiPreferences>('GET', '/preferences');
    }

    patchPreferences(patch: ApiPatch<ApiPreferences>): Promise<ApiPreferences> {
        return this.json<ApiPreferences>('PATCH', '/preferences', { body: patch });
    }

    // --------------------------------------------------------------- network

    async connectNetwork(network: 'ed2k' | 'kad' | 'both' = 'both'): Promise<string> {
        const body = await this.json<{ message?: string } | null>('POST', '/networks/connect', { body: { network } });
        return body?.message ?? '';
    }

    async disconnectNetwork(network: 'ed2k' | 'kad' | 'both' = 'both'): Promise<string> {
        const body = await this.json<{ message?: string } | null>('POST', '/networks/disconnect', { body: { network } });
        return body?.message ?? '';
    }

    async kadBootstrap(ip: string, port: number): Promise<void> {
        await this.send('POST', '/kad/bootstrap', { body: { ip, port } });
    }

    async kadUpdate(url: string): Promise<void> {
        await this.send('POST', '/kad/update', { body: { url } });
    }

    // ------------------------------------------------------------ logs/stats

    async log(tail?: number): Promise<string[]> {
        const body = await this.json<ApiLogLines>('GET', '/logs/amule', { query: { tail } });
        return body.lines ?? [];
    }

    async serverInfo(): Promise<string> {
        const body = await this.json<ApiServerInfoLog>('GET', '/logs/server_info');
        return body.text ?? '';
    }

    async statsTree(maxClientVersions = 0): Promise<ApiStatsNode[]> {
        const body = await this.json<{ nodes: ApiStatsNode[] }>('GET', '/stats/tree', {
            query: { max_client_versions: maxClientVersions }
        });
        return body.nodes ?? [];
    }

    // ---------------------------------------------------------------- search

    startSearch(query: string, type: 'local' | 'global' | 'kad'): Promise<ApiSearch> {
        return this.json<ApiSearch>('POST', '/search', { body: { query, type } });
    }

    async listSearches(): Promise<ApiSearch[]> {
        const body = await this.json<{ searches: ApiSearch[] }>('GET', '/search', {
            query: { sort: 'search_id', order: 'desc', limit: 20 }
        });
        return body.searches ?? [];
    }

    searchResults(id: number): Promise<ApiSearchResults> {
        return this.json<ApiSearchResults>('GET', `/search/${id}/results`, { query: { limit: ALL } });
    }

    async stopSearch(id: number): Promise<void> {
        await this.send('POST', `/search/${id}/stop`);
    }

    async deleteSearch(id: number): Promise<void> {
        await this.send('DELETE', `/search/${id}`);
    }

    async downloadSearchResult(hash: string): Promise<void> {
        await this.send('POST', `/search/results/${hash.toLowerCase()}/download`, { body: {} });
    }

    // ------------------------------------------------------------- transport

    /** A request whose answer is a JSON body (or nothing, for a 202/204). */
    private async json<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
        return (await this.send(method, path, options)) as T;
    }

    private url(path: string, query?: RequestOptions['query']): string {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(query ?? {})) {
            if (value !== undefined) params.set(key, String(value));
        }
        const search = params.toString();
        return `${this.base}${path}${search ? `?${search}` : ''}`;
    }

    private async send(method: Method, path: string, options: RequestOptions = {}, retried = false): Promise<unknown> {
        if (!this.enabled) {
            throw new AmuleApiUnavailableError('amuleapi is not configured (no AMULE_API_PASSWORD)', 0, 'not_configured');
        }
        if (!this.available && !options.probe) {
            throw new AmuleApiUnavailableError(this.downReason || 'amuleapi is cooling down after a failure');
        }

        if (!options.anonymous) await this.ensureToken();

        const url = this.url(path, options.query);
        const cached = options.revalidate ? this.etags.get(url) : undefined;
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';
        if (this.token && !options.anonymous) headers.Authorization = `Bearer ${this.token}`;
        if (cached) headers['If-None-Match'] = cached.etag;

        let response: Response;
        try {
            response = await fetch(url, {
                method,
                headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
                signal: AbortSignal.timeout(this.timeoutMs)
            });
        } catch (error: any) {
            // ECONNREFUSED, timeout, DNS: amuleapi is not there.
            const reason = `Cannot reach amuleapi at ${this.address} (${transportReason(error)})`;
            if (options.probe) throw new AmuleApiUnavailableError(reason);
            throw this.markDown(reason, DOWN_COOLDOWN_MS);
        }

        if (response.status === 304 && cached) {
            this.recovered();
            return cached.body;
        }

        if (response.status === 401 && !options.anonymous) {
            // An expired or revoked token is expected (amuleapi restarts, the
            // password was rotated). Log in again once; a second 401 is terminal,
            // and the reference is explicit that retrying a 401 never succeeds.
            this.token = null;
            if (!retried) return this.send(method, path, options, true);
            throw this.markDown('amuleapi keeps rejecting a fresh token', DOWN_COOLDOWN_MS, 401, 'unauthorized');
        }

        const text = await response.text();
        let body: unknown = null;
        if (text) {
            try {
                body = JSON.parse(text);
            } catch {
                throw new AmuleApiError(502, 'invalid_json', `amuleapi answered ${path} with something that is not JSON`);
            }
        }

        if (!response.ok) {
            if (options.probe) {
                const envelope = body as ApiErrorEnvelope | null;
                throw new AmuleApiError(response.status, envelope?.error?.code || 'http_' + response.status, envelope?.error?.message || `amuleapi answered ${response.status}`);
            }
            throw this.failure(response, path, body as ApiErrorEnvelope | null);
        }

        if (!options.probe) this.recovered();

        const etag = response.headers.get('etag');
        if (options.revalidate && etag) this.etags.set(url, { etag, body });

        return body;
    }

    /** Turns an error status into the right error class, cooling down where that helps. */
    private failure(response: Response, path: string, envelope: ApiErrorEnvelope | null): Error {
        const code = envelope?.error?.code || 'http_' + response.status;
        const message = envelope?.error?.message || `amuleapi answered ${response.status} for ${path}`;

        if (response.status === 429 && code === 'rate_limited') {
            const retryAfter = Number(response.headers.get('retry-after')) || 300;
            return this.markDown(`amuleapi rate-limited this address for ${retryAfter}s`, retryAfter * 1000, 429, code);
        }

        if (response.status === 503) {
            const cooldown = code === 'ec_unavailable' ? EC_UNAVAILABLE_COOLDOWN_MS : DOWN_COOLDOWN_MS;
            // Some routes (chat, known clients) answer ec_unsupported on an old
            // amuled; that is about the route, not the daemon, so stay up.
            if (code === 'ec_unsupported') return new AmuleApiUnavailableError(message, 503, code);
            return this.markDown(`amuleapi: ${message}`, cooldown, 503, code);
        }

        if (response.status >= 500) {
            return new AmuleApiUnavailableError(`amuleapi: ${message}`, response.status, code);
        }

        return new AmuleApiError(response.status, code, message);
    }

    private async ensureToken(): Promise<void> {
        const expiring = Date.now() / 1000 > this.tokenExpiresAt - TOKEN_SAFETY_MARGIN_S;
        if (this.token && !expiring) return;

        // Concurrent cold-start requests share one login instead of racing N.
        this.loginInFlight ??= this.login().finally(() => {
            this.loginInFlight = null;
        });
        await this.loginInFlight;
    }

    private async login(): Promise<void> {
        this.token = null;

        let response: Response;
        try {
            response = await fetch(this.url('/auth/login', { include_token: true }), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ password: this.password }),
                signal: AbortSignal.timeout(this.timeoutMs)
            });
        } catch (error: any) {
            throw this.markDown(`Cannot reach amuleapi at ${this.address} (${transportReason(error)})`, DOWN_COOLDOWN_MS);
        }

        const body = await response.json().catch(() => null) as (ApiLoginResponse & ApiErrorEnvelope) | null;

        if (response.status === 401 || response.status === 403) {
            throw this.markDown('amuleapi rejected AMULE_API_PASSWORD', BAD_CREDENTIALS_COOLDOWN_MS, response.status, 'invalid_credentials');
        }
        if (!response.ok) {
            throw this.failure(response, '/auth/login', body);
        }
        if (!body?.token) {
            throw this.markDown('amuleapi login returned no token', DOWN_COOLDOWN_MS, 502, 'no_token');
        }

        this.token = body.token;
        // The contract always sends expires_at; without it, assume an hour
        // rather than treating the token as already expired, which would log in
        // again before every request.
        const expiresAt = Number(body.expires_at);
        this.tokenExpiresAt = Number.isFinite(expiresAt) && expiresAt > 0
            ? expiresAt
            : Date.now() / 1000 + FALLBACK_TOKEN_LIFETIME_S;
        this.role = body.role ?? null;
        log.debug(`Logged in to amuleapi as ${body.role}`);
    }

    private markDown(reason: string, cooldownMs: number, status = 0, code = 'unavailable'): AmuleApiUnavailableError {
        this.downUntil = Date.now() + cooldownMs;
        this.downReason = reason;
        if (!this.loggedDown) {
            this.loggedDown = true;
            log.warn(`${reason} - using EC until it answers again.`);
        }
        return new AmuleApiUnavailableError(reason, status, code);
    }

    private recovered(): void {
        if (this.loggedDown) {
            this.loggedDown = false;
            log.info(`amuleapi at ${this.address} is answering again.`);
        }
        this.downReason = '';
    }
}
