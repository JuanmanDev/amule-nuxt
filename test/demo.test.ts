import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import mcpInfo from '../app/utils/demo/mcpInfo.json';
import { DemoDaemon, buildResultPool } from '../app/utils/demo/simulator';
import { handleDemoRequest } from '../app/utils/demo/router';
import { CATALOG, ed2kLinkOf, hashOf } from '../app/utils/demo/catalog';

/** A daemon with no storage: every test starts from the opening scene. */
const fresh = () => new DemoDaemon(null);

describe('demo catalog', () => {
    it('gives every file a stable, unique 32 hex hash', () => {
        const hashes = CATALOG.map(entry => hashOf(entry.name, entry.size));
        expect(new Set(hashes).size).toBe(CATALOG.length);
        for (const hash of hashes) expect(hash).toMatch(/^[0-9A-F]{32}$/);
        expect(hashOf('a', 1)).toBe(hashOf('a', 1));
        expect(hashOf('a', 1)).not.toBe(hashOf('a', 2));
    });

    it('builds links the app can parse back', () => {
        const link = ed2kLinkOf('Big Buck Bunny.mp4', 1234, 'ABCDEF0123456789ABCDEF0123456789');
        expect(link).toBe('ed2k://|file|Big%20Buck%20Bunny.mp4|1234|ABCDEF0123456789ABCDEF0123456789|/');
    });
});

describe('demo daemon', () => {
    it('opens with a populated queue, shared list and servers', () => {
        const daemon = fresh();
        expect(daemon.getDownloads().length).toBeGreaterThan(5);
        expect(daemon.getSharedFiles().length).toBeGreaterThan(5);
        expect(daemon.getServers().length).toBeGreaterThan(3);
        expect(daemon.status().connected).toBe(true);
        expect(daemon.status().ed2kConnected).toBe(true);
    });

    it('moves downloads forward on every tick and leaves paused ones alone', () => {
        const daemon = fresh();
        const before = daemon.getDownloads();
        const paused = before.find(d => d.status === 'Paused')!;
        const active = before.find(d => d.status === 'Downloading')!;

        for (let i = 0; i < 5; i++) daemon.tick();

        const after = daemon.getDownloads();
        expect(after.find(d => d.hash === active.hash)!.sizeDone).toBeGreaterThan(active.sizeDone);
        expect(after.find(d => d.hash === paused.hash)!.sizeDone).toBe(paused.sizeDone);
        expect(daemon.status().downloadSpeed).toBeGreaterThan(0);
    });

    it('finishes a download into the shared list and announces it', () => {
        const daemon = fresh();
        const events: string[] = [];
        daemon.onDownloadEvents(batch => events.push(...batch.map(e => `${e.kind}:${e.hash}`)));

        // Almost done, alone in the queue, so it finishes within a few seconds
        const target = daemon.getDownloads().find(d => d.status === 'Downloading' && d.percentComplete > 90)!;
        for (const d of daemon.getDownloads()) if (d.hash !== target.hash) daemon.cancel(d.hash);

        for (let i = 0; i < 600 && daemon.getDownloads().length > 0; i++) daemon.tick();

        expect(daemon.getDownloads()).toHaveLength(0);
        expect(daemon.getSharedFiles().some(f => f.hash === target.hash)).toBe(true);
        expect(events).toContain(`completed:${target.hash}`);
    });

    it('adds a link once and reports the second time as a duplicate', () => {
        const daemon = fresh();
        const link = ed2kLinkOf('demo-file.iso', 1000, hashOf('demo-file.iso', 1000));
        const first = daemon.addLinks([link]);
        const second = daemon.addLinks([link, 'not a link']);
        expect(first.added).toBe(1);
        expect(second.duplicates).toBe(1);
        expect(second.rejected).toBe(1);
        expect(daemon.getDownloads().filter(d => d.name === 'demo-file.iso')).toHaveLength(1);
    });

    it('reveals search results over time and lets one be downloaded', () => {
        const daemon = fresh();
        expect(daemon.search('Kad', 'xubuntu').success).toBe(true);
        const early = daemon.getSearchResults();
        expect(early.progress).toBeLessThan(100);
        daemon.stopSearch();
        const done = daemon.getSearchResults();
        expect(done.progress).toBe(100);
        expect(done.results.some(r => r.fileName.includes('xubuntu'))).toBe(true);

        const fresh_ = done.results.find(r => !daemon.getDownloads().some(d => d.hash === r.hash))!;
        expect(daemon.downloadFromSearch(fresh_.hash).success).toBe(true);
        expect(daemon.getDownloads().some(d => d.hash === fresh_.hash)).toBe(true);
    });

    it('refuses to search while disconnected', () => {
        const daemon = fresh();
        daemon.disconnect();
        expect(daemon.search('Kad', 'anything').success).toBe(false);
        expect(daemon.status().ed2kConnected).toBe(false);
        expect(daemon.status().kadConnected).toBe(false);
    });

    it('accumulates automatic search results pass by pass', () => {
        const daemon = fresh();
        const created = daemon.createAutoSearch({ keyword: 'debian', networks: ['Kad', 'Global'], duration: '1h', intervalMs: 60_000 });
        expect(created.runs).toBe(1);
        expect(created.results.length).toBeGreaterThan(0);
        expect(daemon.stopAutoSearch(created.id)?.status).toBe('stopped');
        expect(daemon.resumeAutoSearch(created.id)?.status).toBe('active');
        expect(daemon.removeAutoSearch(created.id)).toBe(true);
        expect(daemon.getAutoSearch(created.id)).toBeNull();
    });

    it('keeps bandwidth limits and preferences in step', () => {
        const daemon = fresh();
        daemon.setBandwidthLimits({ uploadLimit: 100, downloadLimit: 900 });
        expect(daemon.getPreferences().connection.maxDownload).toBe(900);
        expect(daemon.getStatistics().downloadLimit).toBe(900);
    });
});

describe('search result pool', () => {
    it('is deterministic and never empty', () => {
        expect(buildResultPool('wikipedia', 'Kad')).toEqual(buildResultPool('wikipedia', 'Kad'));
        expect(buildResultPool('something nobody shares', 'Local').length).toBeGreaterThan(0);
        const numbers = buildResultPool('linux', 'Global').map(r => r.resultNumber);
        expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    });
});

describe('demo router', () => {
    const daemon = fresh();
    const call = (method: any, path: string, body?: any, query: Record<string, string> = {}) =>
        handleDemoRequest(daemon, { method, path, body, query });

    it('answers the read endpoints with the ApiResponse envelope', () => {
        for (const path of ['/api/amule/status', '/api/amule/downloads', '/api/amule/uploads', '/api/amule/shared', '/api/amule/servers',
            '/api/amule/statistics', '/api/amule/statistics/tree', '/api/amule/logs', '/api/amule/preferences', '/api/amule/bandwidth',
            '/api/amule/search/sessions', '/api/amule/search/auto', '/api/diagnostics']) {
            const response = call('GET', path);
            expect(response.success, path).toBe(true);
            expect(response.data, path).toBeDefined();
        }
        expect(call('GET', '/api/amule/statistics/history', undefined, { minutes: '5' }).data.samples).toBeInstanceOf(Array);
    });

    it('routes the download actions by hash', () => {
        const hash = daemon.getDownloads()[0]!.hash;
        expect(call('POST', `/api/amule/downloads/${hash}/pause`).success).toBe(true);
        expect(daemon.getDownloads()[0]!.status).toBe('Paused');
        expect(call('POST', `/api/amule/downloads/${hash}/priority`, { priority: 'Silly' }).success).toBe(false);
        expect(call('POST', `/api/amule/downloads/${hash}/priority`, { priority: 'High' }).success).toBe(true);
        expect(call('POST', `/api/amule/downloads/${hash}/resume`).success).toBe(true);
        expect(call('POST', '/api/amule/downloads/add', {}).success).toBe(false);
    });

    it('lists the MCP tools from a snapshot that matches the server', () => {
        const response = call('GET', '/api/mcp-info');
        expect(response.success).toBe(true);
        expect(response.data.tools.map((tool: any) => tool.name).sort()).toEqual(mcpInfo.tools.map(tool => tool.name).sort());

        // The snapshot is a copy of what the real server answers: every tool
        // file must be in it and vice versa, or the demo shows a stale list.
        // The toolkit names a tool after its file: amuleSearchResults.ts is
        // amule-search-results.
        const declared = readdirSync('server/mcp/tools')
            .filter(file => file.endsWith('.ts'))
            .map(file => file.replace(/\.ts$/, '').replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`))
            .sort();
        expect(declared).toEqual(mcpInfo.tools.map(tool => tool.name).sort());
    });

    it('says honestly what a static page cannot do', () => {
        expect(call('GET', '/api/push/vapid').success).toBe(false);
        expect(call('POST', '/api/assistant/chat', {}).success).toBe(false);
        expect(call('POST', '/mcp', {}).success).toBe(false);
        expect(call('GET', '/api/nothing').success).toBe(false);
    });
});
