import { describe, it, expect, vi, afterEach } from 'vitest';
import { AmuleBackend, magnetToEd2kLink, resolveBackendMode, type AmuleBackendMode } from '../server/utils/amule-backend';
import { AmuleECClient } from '../server/utils/amule-ec/AmuleECClient';
import { AmuleApiClient, AmuleApiError, AmuleApiUnavailableError } from '../server/utils/amule-api/AmuleApiClient';
import downloadsFixture from './fixtures/amuleapi/downloads.json';
import statusFixture from './fixtures/amuleapi/status.json';
import preferencesFixture from './fixtures/amuleapi/preferences.json';

/**
 * amuleapi first, EC as the fallback. The rules under test:
 * - an outage on amuleapi is asked again over EC,
 * - a rejection from amuleapi is the answer and is never repeated over EC,
 * - the mode and the configuration decide whether amuleapi is tried at all.
 */

const HASH = '0123456789abcdef0123456789abcdef';
const ecDownload = { hash: HASH, name: 'from-ec.iso' };

function setup(options: { mode?: AmuleBackendMode; apiPassword?: string; ecConfigured?: boolean } = {}) {
    const ec = new AmuleECClient({ host: 'ec.test', port: 4712, password: 'ec' });
    const api = new AmuleApiClient({ host: 'api.test', port: 4713, password: options.apiPassword ?? 'api' });

    // Nothing may reach the network: every method a test uses is stubbed.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network call'));

    const backend = new AmuleBackend(ec, api, options.mode ?? 'auto', {
        configured: options.ecConfigured ?? true,
        address: 'ec.test:4712'
    });

    return { backend, ec, api };
}

const outage = () => new AmuleApiUnavailableError('Cannot reach amuleapi at api.test:4713 (ECONNREFUSED)');

afterEach(() => {
    vi.restoreAllMocks();
});

describe('reads', () => {
    it('ask amuleapi first and leave EC alone when it answers', async () => {
        const { backend, ec, api } = setup();
        vi.spyOn(api, 'listDownloads').mockResolvedValue(downloadsFixture.downloads as any);
        const viaEc = vi.spyOn(ec, 'getDownloads');

        const downloads = await backend.getDownloads();

        expect(downloads.map(d => d.name)).toEqual(['rig-test-two.mkv', 'rig-test-one.iso']);
        expect(viaEc).not.toHaveBeenCalled();
        expect(backend.info().active).toBe('amuleapi');
    });

    it('fall back to EC when amuleapi is down', async () => {
        const { backend, ec, api } = setup();
        vi.spyOn(api, 'listDownloads').mockRejectedValue(outage());
        vi.spyOn(ec, 'getDownloads').mockResolvedValue([ecDownload] as any);

        expect(await backend.getDownloads()).toEqual([ecDownload]);
        expect(backend.info()).toMatchObject({
            active: 'ec',
            amuleapi: { lastError: expect.stringMatching(/ECONNREFUSED/) }
        });
    });

    it('fall back to EC when amuleapi answers something the mappers cannot read', async () => {
        const { backend, ec, api } = setup();
        vi.spyOn(api, 'listDownloads').mockResolvedValue([null] as any);
        vi.spyOn(ec, 'getDownloads').mockResolvedValue([ecDownload] as any);

        expect(await backend.getDownloads()).toEqual([ecDownload]);
    });

    it('skip amuleapi entirely while it cools down', async () => {
        const { backend, ec, api } = setup();
        (api as any).downUntil = Date.now() + 60_000;
        const viaApi = vi.spyOn(api, 'listDownloads');
        vi.spyOn(ec, 'getDownloads').mockResolvedValue([ecDownload] as any);

        await backend.getDownloads();

        expect(viaApi).not.toHaveBeenCalled();
    });

    it('never touch amuleapi without a password', async () => {
        const { backend, ec, api } = setup({ apiPassword: '' });
        const viaApi = vi.spyOn(api, 'listDownloads');
        vi.spyOn(ec, 'getDownloads').mockResolvedValue([ecDownload] as any);

        await backend.getDownloads();

        expect(viaApi).not.toHaveBeenCalled();
        expect(backend.info().amuleapi.configured).toBe(false);
    });

    it('stay on EC in ec mode', async () => {
        const { backend, ec, api } = setup({ mode: 'ec' });
        const viaApi = vi.spyOn(api, 'listDownloads');
        vi.spyOn(ec, 'getDownloads').mockResolvedValue([ecDownload] as any);

        await backend.getDownloads();

        expect(viaApi).not.toHaveBeenCalled();
    });

    it('surface the amuleapi error in amuleapi mode instead of falling back', async () => {
        const { backend, ec, api } = setup({ mode: 'amuleapi' });
        vi.spyOn(api, 'listDownloads').mockRejectedValue(outage());
        const viaEc = vi.spyOn(ec, 'getDownloads');

        await expect(backend.getDownloads()).rejects.toThrow(/ECONNREFUSED/);
        expect(viaEc).not.toHaveBeenCalled();
    });

    it('surface the amuleapi error when there is no EC password to fall back on', async () => {
        const { backend, ec, api } = setup({ ecConfigured: false });
        vi.spyOn(api, 'listDownloads').mockRejectedValue(outage());
        const viaEc = vi.spyOn(ec, 'getDownloads');

        await expect(backend.getDownloads()).rejects.toThrow(/ECONNREFUSED/);
        expect(viaEc).not.toHaveBeenCalled();
    });

    it('answer null for a download amuleapi does not have, without asking EC', async () => {
        const { backend, ec, api } = setup();
        vi.spyOn(api, 'getDownload').mockRejectedValue(new AmuleApiError(404, 'not_found', 'no download with that hash'));
        const viaEc = vi.spyOn(ec, 'getDownloads');

        expect(await backend.getDownload(HASH)).toBe(null);
        expect(viaEc).not.toHaveBeenCalled();
    });

    it('find the download in the EC queue when amuleapi is down', async () => {
        const { backend, ec, api } = setup();
        vi.spyOn(api, 'getDownload').mockRejectedValue(outage());
        vi.spyOn(ec, 'getDownloads').mockResolvedValue([ecDownload] as any);

        expect(await backend.getDownload(HASH.toUpperCase())).toEqual(ecDownload);
    });
});

describe('status', () => {
    it('tags the reading with the link that produced it', async () => {
        const { backend, api } = setup();
        vi.spyOn(api, 'status').mockResolvedValue(statusFixture as any);

        expect(await backend.status()).toMatchObject({ connected: true, transport: 'amuleapi' });
    });

    it('falls back to EC and never throws', async () => {
        const { backend, ec, api } = setup();
        vi.spyOn(api, 'status').mockRejectedValue(outage());
        vi.spyOn(ec, 'status').mockResolvedValue({ connected: false } as any);

        expect(await backend.status()).toMatchObject({ connected: false, transport: 'ec' });
    });

    it('reports disconnected in amuleapi mode rather than throwing', async () => {
        const { backend, api } = setup({ mode: 'amuleapi' });
        vi.spyOn(api, 'status').mockRejectedValue(outage());

        expect(await backend.status()).toMatchObject({ connected: false, transport: 'amuleapi' });
    });
});

describe('commands', () => {
    it('go through amuleapi when it answers', async () => {
        const { backend, ec, api } = setup();
        const patch = vi.spyOn(api, 'patchDownload').mockResolvedValue({} as any);
        const viaEc = vi.spyOn(ec, 'pause');

        expect(await backend.pause(HASH)).toEqual({ success: true, message: 'Download paused' });
        expect(patch).toHaveBeenCalledWith(HASH, { action: 'pause' });
        expect(viaEc).not.toHaveBeenCalled();
    });

    it('report a rejection and never repeat it over EC', async () => {
        const { backend, ec, api } = setup();
        vi.spyOn(api, 'patchDownload').mockRejectedValue(new AmuleApiError(400, 'amuled_rejected', 'File is not paused'));
        const viaEc = vi.spyOn(ec, 'resume');

        expect(await backend.resume(HASH)).toEqual({ success: false, message: 'File is not paused' });
        expect(viaEc).not.toHaveBeenCalled();
    });

    it('fall back to EC when amuleapi is down', async () => {
        const { backend, ec, api } = setup();
        vi.spyOn(api, 'patchDownload').mockRejectedValue(outage());
        const viaEc = vi.spyOn(ec, 'pause').mockResolvedValue({ success: true, message: 'paused over EC' });

        expect(await backend.pause(HASH)).toEqual({ success: true, message: 'paused over EC' });
        expect(viaEc).toHaveBeenCalledWith(HASH);
    });

    it('fall back to EC when the amuleapi password is only a guest one', async () => {
        const { backend, ec, api } = setup();
        vi.spyOn(api, 'patchDownload').mockRejectedValue(new AmuleApiError(403, 'forbidden', 'admin only'));
        const viaEc = vi.spyOn(ec, 'setPriority').mockResolvedValue({ success: true, message: 'ok' });

        await backend.setPriority(HASH, 'High');

        expect(viaEc).toHaveBeenCalledWith(HASH, 'High');
    });

    it('send the priority as amuleapi spells it', async () => {
        const { backend, api } = setup();
        const patch = vi.spyOn(api, 'patchDownload').mockResolvedValue({} as any);

        await backend.setPriority(HASH, 'Auto');

        expect(patch).toHaveBeenCalledWith(HASH, { priority: 'auto' });
    });

    it('validate before calling either link', async () => {
        const { backend, api, ec } = setup();
        const viaApi = vi.spyOn(api, 'patchDownload');
        const viaEc = vi.spyOn(ec, 'pause');

        expect((await backend.pause('nope')).success).toBe(false);
        expect(viaApi).not.toHaveBeenCalled();
        expect(viaEc).not.toHaveBeenCalled();
    });

    it('clear a finished download instead of deleting a partfile that is gone', async () => {
        const { backend, api } = setup();
        vi.spyOn(api, 'deleteDownload').mockRejectedValue(new AmuleApiError(409, 'download_completed', 'completed'));
        const clear = vi.spyOn(api, 'clearCompleted').mockResolvedValue();

        expect(await backend.cancel(HASH)).toMatchObject({ success: true, message: 'Completed download cleared' });
        expect(clear).toHaveBeenCalledWith(HASH);
    });

    it('pass a daemon message through from the connection routes', async () => {
        const { backend, api } = setup();
        vi.spyOn(api, 'connectNetwork').mockResolvedValue('Connecting to eD2k...; Connecting to Kad...');

        expect(await backend.connect()).toEqual({ success: true, message: 'Connecting to eD2k...; Connecting to Kad...' });
    });

    it('read back the bandwidth limits the daemon kept', async () => {
        const { backend, api } = setup();
        vi.spyOn(api, 'patchPreferences').mockResolvedValue({
            ...preferencesFixture,
            connection: { ...preferencesFixture.connection, max_upload_kibibytes_per_second: 3, max_download_kibibytes_per_second: 9 }
        } as any);

        const result = await backend.setBandwidthLimits({ uploadLimit: 3, downloadLimit: 100 });

        // aMule's anti-leech rule caps the download at 3x a tiny upload
        expect(result).toMatchObject({ success: false, data: { uploadLimit: 3, downloadLimit: 9 } });
    });
});

describe('adding links', () => {
    it('sends ed2k links to amuleapi and reports a per-link refusal', async () => {
        const { backend, api } = setup();
        const link = `ed2k://|file|a.iso|1024|${HASH}|/`;
        const add = vi.spyOn(api, 'addDownloads').mockResolvedValue({
            results: [{ id: link, ok: false, error: { code: 'amuled_rejected', message: 'malformed ed2k link' } }]
        });

        expect(await backend.addLink(link)).toEqual({ success: false, message: 'malformed ed2k link' });
        expect(add).toHaveBeenCalledWith([link]);
    });

    it('turns a magnet with name and size into an ed2k link amuleapi accepts', async () => {
        const { backend, api } = setup();
        const add = vi.spyOn(api, 'addDownloads').mockResolvedValue({ results: [{ id: 'x', ok: true }] });

        await backend.addLink(`magnet:?xt=urn:ed2k:${HASH}&dn=a.iso&xl=1024`);

        expect(add).toHaveBeenCalledWith([`ed2k://|file|a.iso|1024|${HASH}|/`]);
    });

    it('hands a magnet it cannot convert to EC', async () => {
        const { backend, api, ec } = setup();
        const viaApi = vi.spyOn(api, 'addDownloads');
        const viaEc = vi.spyOn(ec, 'addLink').mockResolvedValue({ success: true, message: 'ok' });

        await backend.addLink(`magnet:?xt=urn:ed2k:${HASH}`);

        expect(viaApi).not.toHaveBeenCalled();
        expect(viaEc).toHaveBeenCalled();
    });
});

describe('search', () => {
    it('keeps reading the search on the link that started it', async () => {
        const { backend, api, ec } = setup();
        vi.spyOn(api, 'startSearch').mockResolvedValue({ search_id: 7, query: 'ubuntu', type: 'kad', state: 'running' });
        const results = vi.spyOn(api, 'searchResults').mockResolvedValue({
            search_id: 7,
            query: 'ubuntu',
            progress: { state: 'finished', type: 'kad', percent: 100 },
            results: [{ hash: HASH, name: 'ubuntu.iso', size_bytes: 1024, sources: { total: 9, complete: 4 } }]
        });
        const viaEc = vi.spyOn(ec, 'getSearchResults');

        await backend.search('Kad', 'ubuntu');
        const page = await backend.getSearchResults();

        expect(results).toHaveBeenCalledWith(7);
        expect(viaEc).not.toHaveBeenCalled();
        expect(page).toMatchObject({ progress: 100, finished: true, results: [{ fileName: 'ubuntu.iso', completeSources: 4 }] });
    });

    it('frees the previous search, the way EC has one search slot', async () => {
        const { backend, api } = setup();
        let id = 0;
        vi.spyOn(api, 'startSearch').mockImplementation(async () => ({ search_id: ++id, query: 'q', type: 'global', state: 'running' }));
        const freed = vi.spyOn(api, 'deleteSearch').mockResolvedValue();

        await backend.search('Global', 'one');
        await backend.search('Global', 'two');

        expect(freed).toHaveBeenCalledWith(1);
    });

    it('adds an amuleapi hit by its link when amuleapi goes away before the download', async () => {
        const { backend, api, ec } = setup();
        vi.spyOn(api, 'startSearch').mockResolvedValue({ search_id: 7, query: 'u', type: 'kad', state: 'running' });
        vi.spyOn(api, 'searchResults').mockResolvedValue({
            search_id: 7,
            query: 'u',
            progress: { state: 'running', type: 'kad', percent: 50 },
            results: [{ hash: HASH, name: 'u.iso', size_bytes: 1024, sources: { total: 1, complete: 1 } }]
        });
        vi.spyOn(api, 'downloadSearchResult').mockRejectedValue(outage());
        const addLink = vi.spyOn(ec, 'addLink').mockResolvedValue({ success: true, message: 'ok' });

        await backend.search('Kad', 'u');
        await backend.getSearchResults();
        await backend.download(0);

        expect(addLink).toHaveBeenCalledWith(`ed2k://|file|u.iso|1024|${HASH}|/`);
    });
});

describe('helpers', () => {
    it('reads the mode loosely', () => {
        expect(resolveBackendMode('EC')).toBe('ec');
        expect(resolveBackendMode('api')).toBe('amuleapi');
        expect(resolveBackendMode('rest')).toBe('amuleapi');
        expect(resolveBackendMode(undefined)).toBe('auto');
        expect(resolveBackendMode('something')).toBe('auto');
    });

    it('converts only magnets that carry everything an ed2k link needs', () => {
        expect(magnetToEd2kLink(`magnet:?xt=urn:ed2k:${HASH}&dn=a%20b.iso&xl=10`)).toBe(`ed2k://|file|a b.iso|10|${HASH}|/`);
        expect(magnetToEd2kLink(`magnet:?xt=urn:ed2k:${HASH}&dn=a.iso`)).toBe(null);
        expect(magnetToEd2kLink('magnet:?xt=urn:btih:abc&dn=a&xl=1')).toBe(null);
        expect(magnetToEd2kLink(`ed2k://|file|a|1|${HASH}|/`)).toBe(null);
    });
});
