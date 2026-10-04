import { describe, it, expect, vi, afterEach } from 'vitest';
import { AmuleApiClient, AmuleApiError, AmuleApiUnavailableError } from '../server/utils/amule-api/AmuleApiClient';
import downloadsFixture from './fixtures/amuleapi/downloads.json';
import notFoundFixture from './fixtures/amuleapi/error-not-found.json';
import loginErrorFixture from './fixtures/amuleapi/error-login.json';
import healthFixture from './fixtures/amuleapi/health.json';

/**
 * The transport half of the amuleapi integration. What matters is how it fails:
 * an outage must turn into AmuleApiUnavailableError (the backend then asks EC)
 * and a cooldown (so a dead daemon does not cost a timeout per request), while
 * an answer such as 404 must stay an answer.
 *
 * Bodies come from a live aMule 3.1.0 amuleapi (test/fixtures/amuleapi);
 * nothing leaves the process.
 */

const BASE = 'http://localhost:4713/api/v1';

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
type Handler = (request: { method: string; path: string; query: URLSearchParams; headers: Record<string, string>; body?: any }) => Reply;

function json(reply: Reply): Response {
    const body = reply.body === undefined ? null : JSON.stringify(reply.body);
    return new Response(body, { status: reply.status, headers: { 'Content-Type': 'application/json', ...reply.headers } });
}

const loginOk = (token = 'token-1'): Reply => ({
    status: 200,
    body: { token, role: 'admin', expires_at: Math.floor(Date.now() / 1000) + 86_400, session_id: 's' }
});

/** A fake amuleapi: logs every call and answers through `handler`. */
function daemon(handler: Handler, login: () => Reply = () => loginOk()) {
    const calls: Array<{ method: string; path: string; headers: Record<string, string>; body?: any }> = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: any, init: RequestInit = {}) => {
        const url = new URL(String(input));
        const path = url.pathname.replace('/api/v1', '');
        const headers = (init.headers ?? {}) as Record<string, string>;
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        const method = init.method ?? 'GET';
        calls.push({ method, path, headers, body });

        if (path === '/auth/login') return json(login());
        return json(handler({ method, path, query: url.searchParams, headers, body }));
    }) as typeof fetch);

    return { calls, logins: () => calls.filter(call => call.path === '/auth/login').length };
}

const client = () => new AmuleApiClient({ host: 'localhost', port: 4713, password: 'secret', timeoutMs: 200 });

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('AmuleApiClient', () => {
    it('logs in once with the token opt-in, then sends it as a bearer', async () => {
        const { calls, logins } = daemon(() => ({ status: 200, body: downloadsFixture }));
        const api = client();

        await api.listDownloads();
        await api.listDownloads();

        expect(logins()).toBe(1);
        const login = calls.find(call => call.path === '/auth/login')!;
        expect(login.body).toEqual({ password: 'secret' });
        expect(calls.filter(call => call.path === '/downloads').every(call => call.headers.Authorization === 'Bearer token-1')).toBe(true);
    });

    it('shares one login between concurrent cold-start requests', async () => {
        const { logins } = daemon(() => ({ status: 200, body: downloadsFixture }));
        const api = client();

        await Promise.all([api.listDownloads(), api.listDownloads(), api.listDownloads()]);

        expect(logins()).toBe(1);
    });

    it('asks for the whole queue, finished files included', async () => {
        const { calls } = daemon(() => ({ status: 200, body: downloadsFixture }));

        const downloads = await client().listDownloads();

        expect(downloads).toHaveLength(2);
        const request = calls.find(call => call.path === '/downloads')!;
        expect(request).toBeDefined();
        // limit defaults to 100 on amuleapi; status defaults to active only
        const sent = vi.mocked(globalThis.fetch).mock.calls.map(([input]) => String(input)).find(url => url.includes('/downloads'))!;
        expect(sent).toContain('status=all');
        expect(sent).toContain('limit=1000000000');
    });

    it('revalidates lists with If-None-Match and reuses the body on a 304', async () => {
        let served = 0;
        const { calls } = daemon(request => {
            served++;
            if (request.headers['If-None-Match'] === '"v1"') return { status: 304 };
            return { status: 200, body: downloadsFixture, headers: { ETag: '"v1"' } };
        });
        const api = client();

        const first = await api.listDownloads();
        const second = await api.listDownloads();

        expect(served).toBe(2);
        expect(second).toEqual(first);
        expect(calls.filter(call => call.path === '/downloads')[1]!.headers['If-None-Match']).toBe('"v1"');
    });

    it('logs in again once when a token is rejected, then retries', async () => {
        let tokens = 0;
        let rejectNext = true;
        const { calls } = daemon(() => {
            if (rejectNext) {
                rejectNext = false;
                return { status: 401, body: { error: { code: 'unauthorized', message: 'expired' } } };
            }
            return { status: 200, body: downloadsFixture };
        }, () => loginOk(`token-${++tokens}`));

        const downloads = await client().listDownloads();

        expect(downloads).toHaveLength(2);
        expect(tokens).toBe(2);
        expect(calls.filter(call => call.path === '/downloads').at(-1)!.headers.Authorization).toBe('Bearer token-2');
    });

    it('treats a rejected password as an outage and does not retry it during the cooldown', async () => {
        const { logins } = daemon(() => ({ status: 200, body: downloadsFixture }), () => ({ status: 401, body: loginErrorFixture }));
        const api = client();

        await expect(api.listDownloads()).rejects.toBeInstanceOf(AmuleApiUnavailableError);
        await expect(api.listDownloads()).rejects.toBeInstanceOf(AmuleApiUnavailableError);

        // amuleapi locks an IP out after five failures a minute: one attempt only
        expect(logins()).toBe(1);
        expect(api.available).toBe(false);
        expect(api.unavailableReason).toMatch(/AMULE_API_PASSWORD/);
    });

    it('cools down after the daemon refuses the connection, then tries again', async () => {
        vi.useFakeTimers();
        let refused = true;
        vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: any) => {
            if (refused) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
            const path = new URL(String(input)).pathname;
            return json(path.endsWith('/auth/login') ? loginOk() : { status: 200, body: downloadsFixture });
        }) as typeof fetch);
        const api = client();

        await expect(api.listDownloads()).rejects.toThrow(/ECONNREFUSED/);
        await expect(api.listDownloads()).rejects.toBeInstanceOf(AmuleApiUnavailableError);
        expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);

        refused = false;
        vi.advanceTimersByTime(30_001);
        expect(await api.listDownloads()).toHaveLength(2);
        expect(api.available).toBe(true);
    });

    it('keeps a 404 an answer: the client stays available', async () => {
        daemon(() => ({ status: 404, body: notFoundFixture }));
        const api = client();

        const error = await api.getDownload('00000000000000000000000000000000').catch(e => e);

        expect(error).toBeInstanceOf(AmuleApiError);
        expect(error).toMatchObject({ status: 404, code: 'not_found' });
        expect(api.available).toBe(true);
    });

    it('cools down briefly when amuleapi has lost amuled', async () => {
        vi.useFakeTimers();
        daemon(() => ({ status: 503, body: { error: { code: 'ec_unavailable', message: 'EC connection not ready' } } }));
        const api = client();

        await expect(api.status()).rejects.toMatchObject({ code: 'ec_unavailable' });
        expect(api.available).toBe(false);
        vi.advanceTimersByTime(5_001);
        expect(api.available).toBe(true);
    });

    it('honours Retry-After when rate limited', async () => {
        vi.useFakeTimers();
        daemon(() => ({ status: 429, body: { error: { code: 'rate_limited', message: 'slow down' } }, headers: { 'Retry-After': '120' } }));
        const api = client();

        await expect(api.status()).rejects.toBeInstanceOf(AmuleApiUnavailableError);
        vi.advanceTimersByTime(119_000);
        expect(api.available).toBe(false);
        vi.advanceTimersByTime(1_001);
        expect(api.available).toBe(true);
    });

    it('probes health without logging in and without touching the cooldown', async () => {
        vi.useFakeTimers();
        const { logins } = daemon(request => request.path === '/health'
            ? { status: 200, body: healthFixture }
            : { status: 503, body: { error: { code: 'ec_unavailable', message: 'down' } } });
        const api = client();

        await expect(api.status()).rejects.toBeInstanceOf(AmuleApiUnavailableError);
        const health = await api.health();

        expect(health.ec_connected).toBe(true);
        expect(logins()).toBe(1);
        // The probe neither cleared nor extended the cooldown
        expect(api.available).toBe(false);
    });

    it('stays off without a password and never dials', async () => {
        const spy = vi.spyOn(globalThis, 'fetch');
        const api = new AmuleApiClient({ host: 'localhost', port: 4713, password: '' });

        expect(api.enabled).toBe(false);
        await expect(api.listDownloads()).rejects.toMatchObject({ code: 'not_configured' });
        expect(spy).not.toHaveBeenCalled();
    });

    it('keeps a token whose login carried no expiry instead of logging in every time', async () => {
        const { logins } = daemon(() => ({ status: 200, body: downloadsFixture }), () => ({
            status: 200,
            body: { token: 't', role: 'admin', session_id: 's' }
        }));
        const api = client();

        await api.listDownloads();
        await api.listDownloads();

        expect(logins()).toBe(1);
    });

    it('lowers hashes and sends commands as amuleapi spells them', async () => {
        const { calls } = daemon(() => ({ status: 200, body: {} }));
        const api = client();

        await api.patchDownload('ABCDEF1234567890ABCDEF1234567890', { action: 'pause' });

        expect(calls.at(-1)).toMatchObject({
            method: 'PATCH',
            path: '/downloads/abcdef1234567890abcdef1234567890',
            body: { action: 'pause' }
        });
    });

    it('accepts an empty 202/204 body', async () => {
        daemon(() => ({ status: 204 }));

        await expect(client().deleteDownload('abcdef1234567890abcdef1234567890')).resolves.toBeUndefined();
    });
});

describe('AmuleApiClient base URL', () => {
    it('points at /api/v1 on the configured host and port', async () => {
        const { calls } = daemon(() => ({ status: 200, body: healthFixture }));
        await client().health();

        expect(String(vi.mocked(globalThis.fetch).mock.calls[0]![0])).toBe(`${BASE}/health`);
        expect(calls[0]!.headers.Authorization).toBeUndefined();
    });
});
