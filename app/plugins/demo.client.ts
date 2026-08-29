/**
 * Turns the app into the public demo when it was built with NUXT_DEMO=1.
 *
 * The static demo has no server, so every `/api/...` call would 404. This plugin
 * runs before any page and swaps the global `$fetch` for one that answers those
 * calls from the in-browser demo daemon (`utils/demo`), and passes everything
 * else - assets, translations - through untouched. The pages keep calling the
 * same URLs they call against a real server.
 *
 * Registered with `enforce: 'pre'` so it is in place before the prefetch plugin
 * starts its first round of reads.
 */

import { DemoDaemon } from '~/utils/demo/simulator';
import { handleDemoRequest, isDemoApiPath, type HttpMethod } from '~/utils/demo/router';

let daemon: DemoDaemon | null = null;

/** The one daemon of the session. Only exists in a demo build, in the browser. */
export function useDemoDaemon(): DemoDaemon | null {
    return daemon;
}

function pathOf(request: RequestInfo | URL, baseURL: string): string {
    const raw = typeof request === 'string' ? request : request instanceof URL ? request.pathname + request.search : request.url;
    let path = raw;
    try {
        path = new URL(raw, window.location.origin).pathname + new URL(raw, window.location.origin).search;
    } catch {
        // relative already
    }
    // Requests may be written with or without the site's base path
    if (baseURL !== '/' && path.startsWith(baseURL.replace(/\/$/, ''))) {
        path = path.slice(baseURL.replace(/\/$/, '').length) || '/';
    }
    return path;
}

function queryOf(path: string, extra: Record<string, any> | undefined): Record<string, string> {
    const query: Record<string, string> = {};
    const index = path.indexOf('?');
    if (index >= 0) new URLSearchParams(path.slice(index + 1)).forEach((value, key) => { query[key] = value; });
    for (const [key, value] of Object.entries(extra ?? {})) {
        if (value !== undefined && value !== null) query[key] = String(value);
    }
    return query;
}

export default defineNuxtPlugin({
    name: 'amule-demo',
    enforce: 'pre',
    setup(nuxtApp) {
        const config = useRuntimeConfig();
        if (!config.public.demo) return;

        daemon = new DemoDaemon();
        daemon.start();

        const realFetch = globalThis.$fetch;
        const baseURL = config.app.baseURL || '/';

        const demoFetch = (async (request: any, options: any = {}) => {
            const path = pathOf(request, baseURL);
            if (!isDemoApiPath(path)) return realFetch(request, options);

            const method = String(options.method ?? 'GET').toUpperCase() as HttpMethod;
            // A round trip that takes no time at all looks broken; a short one reads as "live"
            await new Promise(resolve => setTimeout(resolve, 40 + Math.random() * 120));
            return handleDemoRequest(daemon!, { method, path: path.split('?')[0]!, body: options.body, query: queryOf(path, options.query) });
        }) as typeof globalThis.$fetch;

        demoFetch.raw = (async (request: any, options: any = {}) => {
            const data = await demoFetch(request, options);
            return { _data: data, status: 200, ok: true, headers: new Headers() } as any;
        }) as typeof globalThis.$fetch.raw;
        demoFetch.create = realFetch.create;

        globalThis.$fetch = demoFetch;
        // Nuxt's own `useFetch` reaches the fetcher through the app instance
        (nuxtApp as any).$fetch = demoFetch;

        // The local assistant talks to /mcp with the bare `fetch`; answer it here too
        const realNativeFetch = window.fetch.bind(window);
        window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
            const path = pathOf(input, baseURL);
            if (!isDemoApiPath(path)) return realNativeFetch(input, init);
            const body = handleDemoRequest(daemon!, {
                method: String(init?.method ?? 'GET').toUpperCase() as HttpMethod,
                path: path.split('?')[0]!,
                body: typeof init?.body === 'string' ? safeJson(init.body) : undefined,
                query: queryOf(path, undefined)
            });
            // A JSON-RPC client expects JSON-RPC back
            const payload = path === '/mcp'
                ? { jsonrpc: '2.0', id: safeJson(String(init?.body ?? ''))?.id ?? null, error: { code: -32000, message: body.error } }
                : body;
            return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }) as typeof window.fetch;

        if (import.meta.hot) {
            import.meta.hot.dispose(() => {
                daemon?.stop();
                daemon = null;
                globalThis.$fetch = realFetch;
                window.fetch = realNativeFetch;
            });
        }
    }
});

function safeJson(text: string): any {
    try { return JSON.parse(text); } catch { return undefined; }
}
