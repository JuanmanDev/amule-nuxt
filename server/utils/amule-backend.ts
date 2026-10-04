/**
 * The one client the app talks to: amuleapi first, EC as the fallback.
 *
 * aMule 3.1 ships amuleapi, a REST daemon beside amuled. Where it is configured
 * it answers first - typed, locale-free JSON, ETag-revalidated lists, and data
 * EC cannot carry (the part map, media metadata, the daemon's own ETA, complete
 * sources on search hits). EC still works against every aMule ever released,
 * 3.1 included, so it stays as the fallback: a call that amuleapi cannot answer
 * (not running, wrong password, rate limited, its own EC link down) is asked
 * again over EC, and amuleapi is left alone for a cooldown so the fallback does
 * not cost a timeout per request.
 *
 * A *rejection* is not an outage. When amuleapi answers "no such download" or
 * relays the daemon refusing a command, that is the answer, and asking EC again
 * would only repeat the command.
 *
 * The method names and return shapes are the EC client's, so routes, the live
 * monitor and the MCP tools do not care which link answered.
 *
 * Mode (`AMULE_BACKEND`):
 * - `auto` (default): amuleapi when configured and answering, EC otherwise.
 * - `amuleapi`: amuleapi only - for a 3.1 daemon whose EC port is loopback-only.
 * - `ec`: EC only, exactly the app before amuleapi existed.
 */

import type {
    AmulePreferences,
    AmuleTransport,
    BandwidthLimits,
    CommandResult,
    Download,
    DownloadPriority,
    SearchResult,
    SearchType,
    Server,
    SharedFile,
    Statistics,
    StatusResult,
    Upload
} from './amule-types';
import { AmuleECClient, isValidFileHash, isValidServerAddress, normalizeBandwidthLimit } from './amule-ec/AmuleECClient';
import { validateDownloadLink } from './amule-ec/links';
import { buildStatsTreeFromApi, type StatsTreeNode } from './amule-ec/statsTree';
import { AmuleApiClient, AmuleApiError, AmuleApiUnavailableError } from './amule-api/AmuleApiClient';
import {
    apiPriorityValue,
    apiToDownload,
    apiToPreferences,
    apiToSearchResult,
    apiToServer,
    apiToSharedFile,
    apiToStatus,
    apiToUpload
} from './amule-api/mappers';
import type { ApiPatch, ApiPreferences, ApiStatsNode } from './amule-api/types';
import { buildEd2kLink } from '../../shared/utils/fileKind';
import { useLogger } from './logger';

const log = useLogger('amule-backend');

export type AmuleBackendMode = 'auto' | 'amuleapi' | 'ec';

/** Accepts the obvious spellings; anything else is `auto`. */
export function resolveBackendMode(value: unknown): AmuleBackendMode {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'ec') return 'ec';
    if (normalized === 'amuleapi' || normalized === 'api' || normalized === 'rest') return 'amuleapi';
    return 'auto';
}

export interface TransportHealth {
    configured: boolean;
    address: string;
    /** Epoch ms of the last call this link answered, 0 when never. */
    lastOkAt: number;
    lastErrorAt: number;
    lastError: string;
}

export interface BackendInfo {
    mode: AmuleBackendMode;
    /** The link that answered the most recent call. */
    active: AmuleTransport | null;
    amuleapi: TransportHealth & {
        /** False while amuleapi is cooling down after a failure. */
        available: boolean;
        unavailableReason: string;
        role: string | null;
    };
    ec: TransportHealth;
}

export interface SearchResultsPage {
    results: SearchResult[];
    /** 0-100. EC reports Kad progress poorly; see the search page. */
    progress: number;
    /** amuleapi knows when a search is over; EC leaves it to a heuristic. */
    finished?: boolean;
}

/** amuleapi's view of the search this process started, or EC's single slot. */
interface ActiveSearch {
    transport: AmuleTransport;
    id?: number;
}

const DISCONNECTED: StatusResult = {
    connected: false,
    ed2kConnected: false,
    kadConnected: false,
    uploadSpeed: 0,
    downloadSpeed: 0,
    queuedClients: 0,
    totalSourceCount: 0
};

/** Finds a node of amuleapi's statistics tree by its stable key. */
function statNode(nodes: ApiStatsNode[], key: string): ApiStatsNode | undefined {
    for (const node of nodes) {
        if (node.key === key) return node;
        const found = statNode(node.children ?? [], key);
        if (found) return found;
    }
    return undefined;
}

function statNumber(node: ApiStatsNode | undefined, extra = false): number {
    const value = node?.values?.[0];
    const raw = extra ? value?.extra?.value : value?.value;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Rebuilds an ed2k link from a magnet that carries an ed2k hash, name and size.
 * amuleapi only takes `ed2k://` links; EC also understands magnets.
 */
export function magnetToEd2kLink(link: string): string | null {
    if (!link.toLowerCase().startsWith('magnet:?')) return null;
    const params = new URLSearchParams(link.slice('magnet:?'.length));
    const hash = params.getAll('xt').map(xt => xt.match(/^urn:ed2k(?:hash)?:([0-9a-f]{32})$/i)?.[1]).find(Boolean);
    const name = params.get('dn');
    const size = Number(params.get('xl'));
    if (!hash || !name || !Number.isFinite(size) || size <= 0) return null;
    return buildEd2kLink(name, size, hash);
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export class AmuleBackend {
    private lastTransport: AmuleTransport | null = null;
    private readonly health: Record<AmuleTransport, { lastOkAt: number; lastErrorAt: number; lastError: string }> = {
        amuleapi: { lastOkAt: 0, lastErrorAt: 0, lastError: '' },
        ec: { lastOkAt: 0, lastErrorAt: 0, lastError: '' }
    };
    private activeSearch: ActiveSearch | null = null;
    private lastSearchResults: SearchResult[] = [];

    constructor(
        readonly ec: AmuleECClient,
        readonly api: AmuleApiClient,
        readonly mode: AmuleBackendMode = 'auto',
        private readonly ecLink: { configured: boolean; address: string } = { configured: true, address: '' }
    ) {}

    // ------------------------------------------------------------ routing

    /** Whether this call should try amuleapi before EC. */
    private apiFirst(): boolean {
        if (this.mode === 'ec' || !this.api.enabled) return false;
        // Forced: let the cooldown error surface rather than silently skipping.
        if (this.mode === 'amuleapi') return true;
        return this.api.available;
    }

    /**
     * Whether a failed amuleapi call may be asked again over EC.
     *
     * Outages always qualify. A 403 does too: a guest token cannot write, but
     * EC can. For reads, so does anything that is not amuleapi's considered
     * answer - a request this version rejects, or a body the mappers could not
     * read - because a read cannot do harm twice. A write that amuleapi answered
     * with a rejection never qualifies: EC would only repeat it.
     */
    private canFallBack(error: unknown, write: boolean): boolean {
        if (this.mode !== 'auto' || !this.ecLink.configured) return false;
        if (error instanceof AmuleApiUnavailableError) return true;
        if (error instanceof AmuleApiError) {
            if (error.status === 403) return true;
            return !write && (error.code === 'bad_request' || error.status === 405 || error.status === 502);
        }
        return !write;
    }

    private ok(transport: AmuleTransport): void {
        this.lastTransport = transport;
        this.health[transport].lastOkAt = Date.now();
    }

    private failed(transport: AmuleTransport, error: unknown): void {
        // A rejection proves the link works; only count real failures.
        if (error instanceof AmuleApiError) {
            this.ok(transport);
            return;
        }
        this.health[transport].lastErrorAt = Date.now();
        this.health[transport].lastError = messageOf(error);
    }

    /** A read: amuleapi first, EC when amuleapi cannot answer. */
    private async read<T>(
        op: string,
        viaApi: (api: AmuleApiClient) => Promise<T>,
        viaEc: (ec: AmuleECClient) => Promise<T>
    ): Promise<T> {
        if (this.apiFirst()) {
            try {
                const value = await viaApi(this.api);
                this.ok('amuleapi');
                return value;
            } catch (error) {
                this.failed('amuleapi', error);
                if (!this.canFallBack(error, false)) throw error;
                log.debug(`${op}: amuleapi could not answer, asking EC -`, messageOf(error));
            }
        }

        try {
            const value = await viaEc(this.ec);
            this.ok('ec');
            return value;
        } catch (error) {
            this.failed('ec', error);
            throw error;
        }
    }

    /**
     * A command. amuleapi's answer becomes a CommandResult; EC already returns
     * one. A rejection from amuleapi is reported as-is and never retried.
     */
    private async command(
        op: string,
        viaApi: (api: AmuleApiClient) => Promise<CommandResult | string | void>,
        viaEc: (ec: AmuleECClient) => Promise<CommandResult>,
        okMessage: string
    ): Promise<CommandResult> {
        if (this.apiFirst()) {
            try {
                const outcome = await viaApi(this.api);
                this.ok('amuleapi');
                if (outcome && typeof outcome === 'object') return outcome;
                return { success: true, message: outcome || okMessage };
            } catch (error) {
                this.failed('amuleapi', error);
                if (!this.canFallBack(error, true)) {
                    return { success: false, message: messageOf(error) };
                }
                log.debug(`${op}: amuleapi could not answer, asking EC -`, messageOf(error));
            }
        }

        const result = await viaEc(this.ec);
        if (result.success) this.ok('ec');
        return result;
    }

    // -------------------------------------------------------- diagnostics

    info(): BackendInfo {
        return {
            mode: this.mode,
            active: this.lastTransport,
            amuleapi: {
                configured: this.api.enabled && this.mode !== 'ec',
                address: this.api.address,
                available: this.api.available,
                unavailableReason: this.api.unavailableReason,
                role: this.api.role,
                ...this.health.amuleapi
            },
            ec: {
                configured: this.ecLink.configured && this.mode !== 'amuleapi',
                address: this.ecLink.address,
                ...this.health.ec
            }
        };
    }

    /**
     * Asks amuleapi who it is, for the diagnostics page. Bypasses the routing
     * on purpose: the page should show amuleapi's own answer, not EC's.
     */
    async probeApi() {
        if (!this.api.enabled || this.mode === 'ec') return null;
        const [health, version] = await Promise.allSettled([this.api.health(), this.api.version(this.api.available)]);
        return {
            health: health.status === 'fulfilled' ? health.value : null,
            version: version.status === 'fulfilled' ? version.value : null,
            error: health.status === 'rejected' ? messageOf(health.reason) : null
        };
    }

    // ------------------------------------------------------------- status

    /** Never throws: the pages, the push and the sampler all poll it. */
    async status(): Promise<StatusResult> {
        if (this.apiFirst()) {
            try {
                const status = apiToStatus(await this.api.status());
                this.ok('amuleapi');
                return { ...status, transport: 'amuleapi' };
            } catch (error) {
                this.failed('amuleapi', error);
                if (!this.canFallBack(error, false)) {
                    return { ...DISCONNECTED, transport: 'amuleapi' };
                }
            }
        }

        if (this.mode === 'amuleapi') return { ...DISCONNECTED, transport: 'amuleapi' };

        const status = await this.ec.status();
        if (status.connected) this.ok('ec');
        else this.failed('ec', new Error('External Connection is not up'));
        return { ...status, transport: 'ec' };
    }

    async getStatistics(): Promise<Statistics> {
        return this.read('statistics', async api => {
            const [status, nodes, prefs] = await Promise.all([api.status(), api.statsTree(1), api.preferences()]);
            const upload = statNode(nodes, 'upload_data');
            const download = statNode(nodes, 'download_data');

            return {
                uptime: statNumber(statNode(nodes, 'uptime')),
                // The transfer counters carry the session figure with the
                // all-time total as their "extra".
                totalUploaded: statNumber(upload, true),
                totalDownloaded: statNumber(download, true),
                sessionUploaded: statNumber(upload),
                sessionDownloaded: statNumber(download),
                uploadRate: Number(status.speeds?.upload_speed_bytes_per_second) || 0,
                downloadRate: Number(status.speeds?.download_speed_bytes_per_second) || 0,
                // EC reports the limits in bytes/s; amuleapi in the KiB/s typed in.
                uploadLimit: (Number(prefs.connection?.max_upload_kibibytes_per_second) || 0) * 1024,
                downloadLimit: (Number(prefs.connection?.max_download_kibibytes_per_second) || 0) * 1024,
                queuedClients: Number(status.queue?.waiting_upload_client_count) || 0,
                totalSourceCount: Number(status.queue?.download_source_count) || 0,
                bannedClients: statNumber(statNode(nodes, 'clients_banned')),
                sharedFiles: statNumber(statNode(nodes, 'shared_count')),
                ed2kUsers: Number(status.ed2k?.network?.user_count) || 0,
                ed2kFiles: Number(status.ed2k?.network?.file_count) || 0,
                kadUsers: Number(status.kad?.network?.user_count) || 0,
                kadFiles: Number(status.kad?.network?.file_count) || 0
            };
        }, ec => ec.getStatistics());
    }

    async getStatsTree(maxClientVersions = 10): Promise<StatsTreeNode | null> {
        return this.read(
            'stats tree',
            async api => buildStatsTreeFromApi(await api.statsTree(Math.max(0, Math.min(255, maxClientVersions)))),
            ec => ec.getStatsTree(maxClientVersions)
        );
    }

    // ---------------------------------------------------------- downloads

    async getDownloads(): Promise<Download[]> {
        return this.read(
            'downloads',
            async api => (await api.listDownloads()).map(apiToDownload),
            ec => ec.getDownloads()
        );
    }

    /**
     * One download with everything known about it. Over amuleapi that is the
     * detail view - the part map, ETA, media - and over EC the queue entry.
     */
    async getDownload(hash: string): Promise<Download | null> {
        if (!isValidFileHash(hash)) return null;

        return this.read(
            'download detail',
            async api => {
                try {
                    return apiToDownload(await api.getDownload(hash));
                } catch (error) {
                    if (error instanceof AmuleApiError && error.status === 404) return null;
                    throw error;
                }
            },
            async ec => (await ec.getDownloads()).find(d => d.hash === hash.toLowerCase()) ?? null
        );
    }

    async addLink(link: string): Promise<CommandResult> {
        const validation = validateDownloadLink(link);
        if (!validation.valid) {
            return { success: false, message: validation.error || 'Invalid link' };
        }

        const trimmed = link.trim();
        const ed2k = trimmed.toLowerCase().startsWith('ed2k://') ? trimmed : magnetToEd2kLink(trimmed);

        // A magnet without the name and size an ed2k link needs: only EC takes it.
        if (!ed2k) {
            return this.mode === 'amuleapi'
                ? { success: false, message: 'amuleapi only accepts ed2k links (or magnets carrying an ed2k hash, name and size)' }
                : this.ec.addLink(trimmed);
        }

        return this.command('add link', async api => {
            const { results } = await api.addDownloads([ed2k]);
            const outcome = results?.[0];
            if (outcome && !outcome.ok) {
                return { success: false, message: outcome.error?.message || 'amuled refused the link' };
            }
            return { success: true, message: 'Link added successfully', data: { link: trimmed } };
        }, ec => ec.addLink(trimmed), 'Link added successfully');
    }

    async pause(hash: string): Promise<CommandResult> {
        if (!isValidFileHash(hash)) return { success: false, message: `Invalid file hash: '${hash}'` };
        return this.command('pause', async api => {
            await api.patchDownload(hash, { action: 'pause' });
        }, ec => ec.pause(hash), 'Download paused');
    }

    async resume(hash: string): Promise<CommandResult> {
        if (!isValidFileHash(hash)) return { success: false, message: `Invalid file hash: '${hash}'` };
        return this.command('resume', async api => {
            await api.patchDownload(hash, { action: 'resume' });
        }, ec => ec.resume(hash), 'Download resumed');
    }

    async cancel(hash: string): Promise<CommandResult> {
        if (!isValidFileHash(hash)) return { success: false, message: `Invalid file hash: '${hash}'` };
        return this.command('cancel', async api => {
            try {
                await api.deleteDownload(hash);
            } catch (error) {
                // A finished file has no partfile left to delete; amuleapi wants
                // it acknowledged instead, which is what removing it from the
                // list means to the user.
                if (error instanceof AmuleApiError && error.code === 'download_completed') {
                    await api.clearCompleted(hash);
                    return 'Completed download cleared';
                }
                throw error;
            }
        }, ec => ec.cancel(hash), 'Download cancelled');
    }

    async setPriority(hash: string, priority: DownloadPriority): Promise<CommandResult> {
        if (!isValidFileHash(hash)) return { success: false, message: `Invalid file hash: '${hash}'` };
        return this.command('priority', async api => {
            await api.patchDownload(hash, { priority: apiPriorityValue(priority) });
        }, ec => ec.setPriority(hash, priority), `Priority set to ${priority}`);
    }

    // ------------------------------------------------------------- shared

    async getSharedFiles(): Promise<SharedFile[]> {
        return this.read(
            'shared files',
            async api => (await api.listShared()).map(apiToSharedFile),
            ec => ec.getSharedFiles()
        );
    }

    /** One shared file with the detail-only fields; EC has only the list entry. */
    async getSharedFile(hash: string): Promise<SharedFile | null> {
        if (!isValidFileHash(hash)) return null;

        return this.read(
            'shared detail',
            async api => {
                try {
                    return apiToSharedFile(await api.getShared(hash));
                } catch (error) {
                    if (error instanceof AmuleApiError && error.status === 404) return null;
                    throw error;
                }
            },
            async ec => (await ec.getSharedFiles()).find(f => f.hash === hash.toLowerCase()) ?? null
        );
    }

    async showUploads(): Promise<Upload[]> {
        return this.read(
            'uploads',
            async api => (await api.listClients('uploading')).map(apiToUpload),
            ec => ec.showUploads()
        );
    }

    // ------------------------------------------------------------ servers

    async showServers(): Promise<Server[]> {
        return this.read(
            'servers',
            async api => (await api.listServers()).map(apiToServer),
            ec => ec.showServers()
        );
    }

    async connectToServer(address: string): Promise<CommandResult> {
        if (!isValidServerAddress(address)) return { success: false, message: `Invalid server address: '${address}'` };
        return this.command('connect server', api => api.connectServer(address), ec => ec.connectToServer(address), 'Connecting to server');
    }

    async removeServer(address: string): Promise<CommandResult> {
        if (!isValidServerAddress(address)) return { success: false, message: `Invalid server address: '${address}'` };
        return this.command('remove server', api => api.removeServer(address), ec => ec.removeServer(address), 'Server removed');
    }

    async addServer(address: string, name?: string): Promise<CommandResult> {
        if (!isValidServerAddress(address)) return { success: false, message: 'Invalid server address, expected ip:port' };
        return this.command('add server', api => api.addServer(address, name?.trim() || undefined), ec => ec.addServer(address, name), 'Server added');
    }

    async getServerInfo(): Promise<string[]> {
        return this.read('server info', async api => (await api.serverInfo())
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean), ec => ec.getServerInfo());
    }

    async updateServerListFromUrl(url?: string): Promise<CommandResult> {
        let target = url?.trim() ?? '';
        if (!target) {
            try {
                target = (await this.getPreferences()).servers.updateUrl;
            } catch (error) {
                return { success: false, message: messageOf(error) };
            }
        }
        if (!target) return { success: false, message: 'No server list URL configured' };

        return this.command(
            'update server list',
            api => api.updateServerList(target),
            ec => ec.updateServerListFromUrl(target),
            `Updating the server list from ${target}`
        );
    }

    // ------------------------------------------------------------ network

    async connect(network?: 'ed2k' | 'kad'): Promise<CommandResult> {
        return this.command('connect', api => api.connectNetwork(network ?? 'both'), ec => ec.connect(network), 'Connecting...');
    }

    async disconnect(network?: 'ed2k' | 'kad'): Promise<CommandResult> {
        return this.command('disconnect', api => api.disconnectNetwork(network ?? 'both'), ec => ec.disconnect(network), 'Disconnected');
    }

    async setKadRunning(running: boolean): Promise<CommandResult> {
        return this.command(
            'kad',
            api => running ? api.connectNetwork('kad') : api.disconnectNetwork('kad'),
            ec => ec.setKadRunning(running),
            running ? 'Starting Kad' : 'Kad stopped'
        );
    }

    async bootstrapKad(ip: string, port: number): Promise<CommandResult> {
        return this.command('kad bootstrap', api => api.kadBootstrap(ip.trim(), port), ec => ec.bootstrapKad(ip, port), `Bootstrapping Kad from ${ip}:${port}`);
    }

    async updateKadNodes(url: string): Promise<CommandResult> {
        if (!url?.trim()) return { success: false, message: 'A nodes.dat URL is required' };
        return this.command('kad nodes', api => api.kadUpdate(url.trim()), ec => ec.updateKadNodes(url), 'Updating Kad nodes');
    }

    // --------------------------------------------------------------- logs

    async showLog(): Promise<string[]> {
        return this.read(
            'log',
            // amuleapi keeps each line's own newline; EC sends one blob.
            async api => (await api.log()).map(line => line.replace(/\r?\n$/, '')).filter(line => line.trim().length > 0),
            ec => ec.showLog()
        );
    }

    // -------------------------------------------------------- preferences

    async getPreferences(): Promise<AmulePreferences> {
        return this.read('preferences', async api => apiToPreferences(await api.preferences()), ec => ec.getPreferences());
    }

    async getBandwidthLimits(): Promise<BandwidthLimits> {
        return this.read('bandwidth', async api => {
            const prefs = await api.preferences();
            return {
                uploadLimit: Number(prefs.connection?.max_upload_kibibytes_per_second) || 0,
                downloadLimit: Number(prefs.connection?.max_download_kibibytes_per_second) || 0
            };
        }, ec => ec.getBandwidthLimits());
    }

    /**
     * Same contract as the EC client: validated before it is sent, and `data`
     * is what the daemon holds afterwards. amuleapi answers a PATCH with the
     * whole preferences object, so the read-back costs no second request - and
     * shows aMule's anti-leech rule when a low upload cap lowered the download.
     */
    async setBandwidthLimits(limits: BandwidthLimits): Promise<CommandResult> {
        let upload: number;
        let download: number;
        try {
            upload = normalizeBandwidthLimit(limits?.uploadLimit, 'Upload limit');
            download = normalizeBandwidthLimit(limits?.downloadLimit, 'Download limit');
        } catch (error) {
            return { success: false, message: messageOf(error) };
        }

        return this.command('bandwidth', async api => {
            const prefs = await api.patchPreferences({
                connection: {
                    max_upload_kibibytes_per_second: upload,
                    max_download_kibibytes_per_second: download
                }
            });
            const applied = {
                uploadLimit: Number(prefs.connection?.max_upload_kibibytes_per_second) || 0,
                downloadLimit: Number(prefs.connection?.max_download_kibibytes_per_second) || 0
            };
            if (applied.uploadLimit !== upload || applied.downloadLimit !== download) {
                return {
                    success: false,
                    message: `The daemon kept ${applied.uploadLimit} kB/s up and ${applied.downloadLimit} kB/s down instead of ${upload}/${download}`,
                    data: applied
                };
            }
            return { success: true, message: 'Bandwidth limits updated', data: applied };
        }, ec => ec.setBandwidthLimits({ uploadLimit: upload, downloadLimit: download }), 'Bandwidth limits updated');
    }

    async setNickname(nickname: string): Promise<CommandResult> {
        const trimmed = nickname.trim();
        if (!trimmed) return { success: false, message: 'Nickname cannot be empty' };

        return this.command('nickname', async api => {
            await api.patchPreferences({ general: { nickname: trimmed } });
        }, ec => ec.setNickname(trimmed), 'Nickname updated');
    }

    async setConnectionPreferences(values: {
        maxUpload?: number;
        maxDownload?: number;
        maxConnections?: number;
        maxSourcesPerFile?: number;
    }): Promise<CommandResult> {
        const valid = (value?: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0
            ? Math.round(value)
            : undefined;

        const connection: NonNullable<ApiPatch<ApiPreferences>['connection']> = {};
        const set = <K extends keyof typeof connection>(key: K, value?: number) => {
            const checked = valid(value);
            if (checked !== undefined) (connection as Record<string, number>)[key] = checked;
        };
        set('max_upload_kibibytes_per_second', values.maxUpload);
        set('max_download_kibibytes_per_second', values.maxDownload);
        set('max_connection_count', values.maxConnections);
        set('max_sources_per_file_count', values.maxSourcesPerFile);

        if (Object.keys(connection).length === 0) {
            return { success: false, message: 'No connection settings to change' };
        }

        return this.command('connection prefs', async api => {
            await api.patchPreferences({ connection });
        }, ec => ec.setConnectionPreferences(values), 'Connection settings updated');
    }

    async setServerPreferences(values: {
        removeDead?: boolean;
        deadServerRetries?: number;
        autoUpdate?: boolean;
        addFromServer?: boolean;
        addFromClient?: boolean;
        updateUrl?: string;
    }): Promise<CommandResult> {
        const servers: NonNullable<ApiPatch<ApiPreferences>['servers']> = {};
        if (typeof values.removeDead === 'boolean') servers.remove_dead_servers = values.removeDead;
        if (typeof values.autoUpdate === 'boolean') servers.update_list_at_startup = values.autoUpdate;
        if (typeof values.addFromServer === 'boolean') servers.update_list_from_server = values.addFromServer;
        if (typeof values.addFromClient === 'boolean') servers.update_list_from_client = values.addFromClient;
        if (typeof values.deadServerRetries === 'number' && values.deadServerRetries >= 0) {
            servers.dead_server_retry_count = Math.min(255, Math.round(values.deadServerRetries));
        }
        if (values.updateUrl) servers.update_url = values.updateUrl.trim();

        if (Object.keys(servers).length === 0) {
            return { success: false, message: 'No server settings to change' };
        }

        return this.command('server prefs', async api => {
            await api.patchPreferences({ servers });
        }, ec => ec.setServerPreferences(values), 'Server settings updated');
    }

    // ------------------------------------------------------------- search

    /**
     * Starts a search. amuleapi runs several at once, but the app - like EC -
     * has one search slot, so starting a new one frees the previous one rather
     * than leaving it in amuled's twenty-entry ring.
     */
    async search(type: SearchType, keyword: string): Promise<CommandResult> {
        if (!keyword?.trim()) return { success: false, message: 'Search keyword is required' };

        const previous = this.activeSearch?.transport === 'amuleapi' ? this.activeSearch.id : undefined;
        const apiType = type.toLowerCase() as 'global' | 'kad' | 'local';

        const result = await this.command('search', async api => {
            const created = await api.startSearch(keyword.trim(), apiType);
            this.activeSearch = { transport: 'amuleapi', id: created.search_id };
            this.lastSearchResults = [];
            return { success: true, message: 'Search started', data: { type, keyword } };
        }, async ec => {
            const started = await ec.search(type, keyword);
            if (started.success) {
                this.activeSearch = { transport: 'ec' };
                this.lastSearchResults = [];
            }
            return started;
        }, 'Search started');

        if (result.success && previous !== undefined && previous !== this.activeSearch?.id) {
            this.api.deleteSearch(previous).catch(() => undefined);
        }

        return result;
    }

    async stopSearch(): Promise<CommandResult> {
        const current = this.activeSearch;
        if (current?.transport === 'amuleapi' && current.id !== undefined) {
            const id = current.id;
            try {
                await this.api.stopSearch(id);
                return { success: true, message: 'Search stopped' };
            } catch (error) {
                // Already gone is as stopped as it gets.
                if (error instanceof AmuleApiError && error.status === 404) {
                    return { success: true, message: 'Search stopped' };
                }
                return { success: false, message: messageOf(error) };
            }
        }
        return this.ec.stopSearch();
    }

    /**
     * Results of the search this process started. A search lives on the link
     * that started it: an amuleapi search id means nothing to EC.
     */
    async getSearchResults(): Promise<SearchResultsPage> {
        const current = this.activeSearch;

        if (current?.transport === 'amuleapi' && current.id !== undefined) {
            try {
                const page = await this.api.searchResults(current.id);
                this.ok('amuleapi');
                this.lastSearchResults = (page.results ?? []).map(apiToSearchResult);
                return {
                    results: this.lastSearchResults,
                    progress: Number(page.progress?.percent) || 0,
                    finished: page.progress?.state !== 'running'
                };
            } catch (error) {
                // Freed or evicted from amuled's ring: what was collected stands.
                if (error instanceof AmuleApiError && error.status === 404) {
                    return { results: this.lastSearchResults, progress: 100, finished: true };
                }
                this.failed('amuleapi', error);
                throw error;
            }
        }

        if (!current && this.apiFirst()) {
            // Nothing started here (a restart, or the first visit): adopt the
            // newest search amuled holds, the way EC shows its last results.
            try {
                const [latest] = (await this.api.listSearches()).filter(search => search.type !== 'browse');
                if (!latest) return { results: [], progress: 0, finished: true };
                this.activeSearch = { transport: 'amuleapi', id: latest.search_id };
                return this.getSearchResults();
            } catch (error) {
                this.failed('amuleapi', error);
                if (!this.canFallBack(error, false)) throw error;
            }
        }

        if (this.mode === 'amuleapi') return { results: [], progress: 0, finished: true };

        const page = await this.ec.getSearchResults();
        this.lastSearchResults = page.results;
        return page;
    }

    /** Downloads a result of the last search, by result number or hash. */
    async download(identifier: number | string): Promise<CommandResult> {
        if (typeof identifier === 'number') {
            const result = this.lastSearchResults.find(r => r.resultNumber === identifier);
            if (!result) {
                return { success: false, message: `Result number ${identifier} not found in last search results` };
            }
            return this.downloadSearchResult(result.hash);
        }
        return this.downloadSearchResult(identifier);
    }

    async downloadSearchResult(hash: string): Promise<CommandResult> {
        if (!isValidFileHash(hash)) return { success: false, message: `Invalid file hash: '${hash}'` };

        return this.command('download result', api => api.downloadSearchResult(hash), async ec => {
            // EC only knows its own search. A hit that came from amuleapi is
            // added by its link instead, which is the same download.
            if (this.activeSearch?.transport === 'amuleapi') {
                const result = this.lastSearchResults.find(r => r.hash === hash.toLowerCase());
                if (result) return ec.addLink(result.ed2kLink);
            }
            return ec.downloadSearchResult(hash);
        }, 'Download started');
    }
}
