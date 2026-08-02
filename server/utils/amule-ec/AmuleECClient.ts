import type {
    AmuleConfig,
    AmulePreferences,
    StatusResult,
    SharedFile,
    Download,
    DownloadStatus,
    DownloadPriority,
    Server,
    SearchResult,
    Statistics,
    CommandResult,
    SearchType,
    Upload,
    BandwidthLimits
} from '../amule-types';
import {
    AMuleProtocol,
    ECSearchType,
    ECPartFileStatus,
    ECPriority,
    ECConnState,
    ECTagNames,
    ECOpCodes,
    ECPrefsSelect,
    type ECResponse
} from './lib/AMuleProtocol';
import { validateDownloadLink } from './links';
import { useLogger } from '../logger';
import { buildStatsTree, type StatsTreeNode } from './statsTree';

/**
 * Maps aMule's PS_* partfile status to a UI status label.
 * Mirrors CEC_PartFile_Tag::GetFileStatusString() in aMule's ECSpecialTags.cpp.
 */
function mapDownloadStatus(statusCode: number, sourcesXfer: number): DownloadStatus {
    switch (statusCode) {
        case ECPartFileStatus.PS_HASHING:
        case ECPartFileStatus.PS_WAITING_FOR_HASH:
            return 'Hashing';
        case ECPartFileStatus.PS_COMPLETING:
        case ECPartFileStatus.PS_COMPLETE:
            return 'Complete';
        case ECPartFileStatus.PS_PAUSED:
            return 'Paused';
        case ECPartFileStatus.PS_ERROR:
            return 'Error';
        default:
            return sourcesXfer > 0 ? 'Downloading' : 'Waiting';
    }
}

/**
 * aMule reports an automatically managed priority as `priority + 10`
 * (see CEC_PartFile_Tag in ECSpecialCoreTags.cpp).
 */
const AUTO_PRIORITY_OFFSET = 10;

export function isAutoPriority(prio: number): boolean {
    return prio >= AUTO_PRIORITY_OFFSET || prio === ECPriority.PR_AUTO;
}

/** Maps aMule's PR_* priority value to a UI priority label. */
function mapPriorityToName(prio: number): DownloadPriority {
    if (isAutoPriority(prio)) {
        return 'Auto';
    }

    switch (prio) {
        case ECPriority.PR_LOW:
        case ECPriority.PR_VERY_LOW:
            return 'Low';
        case ECPriority.PR_HIGH:
        case ECPriority.PR_VERYHIGH:
            return 'High';
        case ECPriority.PR_AUTO:
            return 'Auto';
        default:
            return 'Normal';
    }
}

/** Maps aMule's SRV_PR_* server priority (Server.h) to a label. */
function mapServerPriority(prio: number): 'High' | 'Normal' | 'Low' {
    if (prio === 1) return 'High';
    if (prio === 2) return 'Low';
    return 'Normal';
}

/** EC sends IPv4 addresses as a packed uint32. */
function formatIpv4(value: number | string): string {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
}

/** Servers are addressed as "ip:port" over EC. */
export function isValidServerAddress(address: unknown): address is string {
    if (typeof address !== 'string') return false;

    const [ip, port, ...rest] = address.split(':');
    if (rest.length > 0 || !ip || !port) return false;

    const octets = ip.split('.');
    if (octets.length !== 4) return false;
    if (!octets.every(octet => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)) return false;

    return /^\d{1,5}$/.test(port) && Number(port) > 0 && Number(port) <= 65535;
}

/** aMule identifies a partfile by its 32 hex char MD4 hash. */
export function isValidFileHash(hash: unknown): hash is string {
    return typeof hash === 'string' && /^[0-9a-fA-F]{32}$/.test(hash);
}

/**
 * Upper bound for a bandwidth limit in kB/s. aMule 3.x widened the limit fields
 * from uint16 to uint32 and caps its own spin buttons at 1,000,000 kB/s, which
 * is far above any real link; anything larger is a mistake, not a limit.
 */
export const MAX_BANDWIDTH_LIMIT_KBPS = 1_000_000;

/**
 * Turns a bandwidth limit coming from an HTTP body into the whole kB/s the EC
 * tag carries, or throws with a message worth showing.
 *
 * Rejecting instead of coercing matters: the EC tag is written with
 * `DataView.setUint32`, which silently turns `NaN` or `undefined` into 0 — that
 * is aMule's "unlimited", so a typo used to remove the limit and report success.
 */
export function normalizeBandwidthLimit(value: unknown, label: string): number {
    if (typeof value === 'boolean' || value === null || value === undefined
        || (typeof value === 'string' && value.trim() === '')) {
        throw new Error(`${label} must be a number in kB/s (0 = unlimited)`);
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${label} must be a number in kB/s (0 = unlimited)`);
    }
    if (parsed < 0) {
        throw new Error(`${label} cannot be negative; use 0 for unlimited`);
    }
    if (parsed > MAX_BANDWIDTH_LIMIT_KBPS) {
        throw new Error(`${label} cannot exceed ${MAX_BANDWIDTH_LIMIT_KBPS} kB/s`);
    }

    return Math.round(parsed);
}

/** Maps a UI priority label to aMule's PR_* value. */
function mapPriorityToValue(priority: DownloadPriority): number {
    switch (priority) {
        case 'Low': return ECPriority.PR_LOW;
        case 'High': return ECPriority.PR_HIGH;
        case 'Auto': return ECPriority.PR_AUTO;
        default: return ECPriority.PR_NORMAL;
    }
}

const log = useLogger('amule-client');

/**
 * How long to answer "unreachable" straight away after a failed connect.
 *
 * Without it every request pays the TCP timeout again: the pages poll every few
 * seconds, so a daemon that is down turns into a queue of requests that each
 * block for seconds and make the whole UI feel broken.
 */
const CONNECT_COOLDOWN_MS = 5000;

/** Prefix of the error ensureConnected raises, used to keep the log readable. */
const UNREACHABLE_PREFIX = 'Cannot reach the aMule daemon';

/**
 * An unreachable daemon is polled every few seconds, so logging it as an error
 * with a stack trace buries the failures that are actually worth reading.
 */
function logRequestFailure(error: any): void {
    const message = String(error?.message ?? error);

    if (message.startsWith(UNREACHABLE_PREFIX)) {
        log.debug('EC request skipped:', message);
    } else {
        log.error('EC request failed', error);
    }
}

export class AmuleECClient {
    private client: AMuleProtocol;
    private config: AmuleConfig;
    private lastSearchResults: SearchResult[] = [];
    /** Timestamp of the last failed connect, 0 while the daemon is reachable. */
    private connectFailedAt = 0;
    private connectError = '';

    constructor(config: AmuleConfig) {
        this.config = config;
        this.client = new AMuleProtocol({
            host: config.host,
            port: Number(config.port),
            password: config.password
        });
    }

    /**
     * Connect to aMule EC
     */
    private async ensureConnected(): Promise<void> {
        if (this.client.getIsConnected()) {
            return;
        }

        // Fail fast while the daemon is known to be down, and retry once the
        // cooldown has passed so the UI recovers on its own.
        const sinceFailure = Date.now() - this.connectFailedAt;
        if (this.connectFailedAt > 0 && sinceFailure < CONNECT_COOLDOWN_MS) {
            throw new Error(this.connectError);
        }

        try {
            await this.client.connect();
            this.connectFailedAt = 0;
            this.connectError = '';
        } catch (err: any) {
            this.connectFailedAt = Date.now();
            this.connectError = `Cannot reach the aMule daemon at ${this.config.host}:${this.config.port} (${err?.message || err})`;
            log.debug('Could not open the External Connection', err?.message);
            throw new Error(this.connectError);
        }
    }

    /**
     * Get downloads list with full details
     */
    async getDownloads(): Promise<Download[]> {
        try {
            await this.ensureConnected();
            const files = await this.client.getDownloads();

            return files
                // Skip entries without a hash: they cannot be acted upon (pause/cancel need the hash)
                .filter((file: any) => typeof file.partfile_hash === 'string' && file.partfile_hash.length === 32)
                .map((file: any) => {
                    const speed = Number(file.partfile_speed || 0) / 1024;
                    const sourcesXfer = Number(file.partfile_source_count_xfer || 0);
                    const status = mapDownloadStatus(Number(file.partfile_status ?? ECPartFileStatus.PS_READY), sourcesXfer);

                    const sizeFull = Number(file.partfile_size_full || 0);
                    const sizeDone = Number(file.partfile_size_done || 0);
                    const percent = sizeFull > 0 ? (sizeDone / sizeFull) * 100 : 0;

                    const rawPriority = Number(file.partfile_prio ?? ECPriority.PR_NORMAL);

                    return {
                        hash: String(file.partfile_hash).toLowerCase(),
                        name: file.partfile_name || 'Unknown',
                        size: sizeFull,
                        sizeDone: sizeDone,
                        status: status,
                        priority: mapPriorityToName(rawPriority),
                        autoPriority: isAutoPriority(rawPriority),
                        speed: speed,
                        sources: Number(file.partfile_source_count || 0),
                        sourcesNotCurrent: Number(file.partfile_source_count_not_current || 0),
                        sourcesA4AF: Number(file.partfile_source_count_a4af || 0),
                        sourcesXfer: sourcesXfer,
                        percentComplete: percent,
                        ed2kLink: file.partfile_ed2k_link || '',
                        availableParts: Number(file.partfile_available_parts || 0),
                        stopped: Boolean(Number(file.partfile_stopped || 0)),
                        lastReceived: Number(file.partfile_last_recv || 0),
                        lastSeenComplete: Number(file.partfile_last_seen_comp || 0)
                    };
                });
        } catch (error) {
            // logRequestFailure(error);
            throw error;
        }
    }

    /**
     * Get server list
     */
    async showServers(): Promise<Server[]> {
        try {
            await this.ensureConnected();
            const servers = await this.client.getServerList();

            return servers.map((s: any) => {
                // At EC_DETAIL_FULL the server tag's own value is an EC_IPv4_t ("ip:port")
                const [valueIp, valuePort] = typeof s.value === 'string' && s.value.includes(':')
                    ? s.value.split(':')
                    : ['', ''];

                return {
                    name: s.server_name || valueIp || 'Unknown',
                    ip: s.server_ip ? formatIpv4(s.server_ip) : valueIp,
                    port: Number(s.server_port || valuePort || 0),
                    description: s.server_desc || '',
                    users: Number(s.server_users || 0),
                    files: Number(s.server_files || 0),
                    ping: Number(s.server_ping || 0),
                    priority: mapServerPriority(Number(s.server_prio || 0)),
                    failed: Number(s.server_failed || 0),
                    static: Boolean(s.server_static)
                };
            });
        } catch (error) {
            logRequestFailure(error);
            throw error;
        }
    }

    /**
     * Get shared files list
     */
    async getSharedFiles(): Promise<SharedFile[]> {
        try {
            await this.ensureConnected();
            const files = await this.client.getSharedFiles();
            return files.map((f: any) => {
                // EC sends the display name in EC_TAG_PARTFILE_NAME and the path in
                // EC_TAG_KNOWNFILE_FILENAME (see CEC_SharedFile_Tag in aMule).
                const fullPath = f.knownfile_filename || '';
                const fileName = f.partfile_name || fullPath.split(/[/\\]/).pop() || 'Unknown';
                const size = Number(f.partfile_size_full || 0);
                const transferredAll = Number(f.knownfile_xferred_all || 0);
                const rawPriority = Number(f.knownfile_prio ?? ECPriority.PR_NORMAL);

                return {
                    fileName: fileName,
                    fullPath: fullPath,
                    hash: typeof f.partfile_hash === 'string' ? f.partfile_hash.toLowerCase() : '',
                    transferredAll,
                    requestsAll: Number(f.knownfile_req_count_all || 0),
                    accepts: Number(f.knownfile_accept_count || 0),
                    acceptsAll: Number(f.knownfile_accept_count_all || 0),
                    onQueue: Number(f.knownfile_on_queue || 0),
                    completeSources: Number(f.knownfile_complete_sources || 0),
                    priority: mapPriorityToName(rawPriority),
                    autoPriority: isAutoPriority(rawPriority),
                    ed2kLink: f.partfile_ed2k_link || '',
                    comment: f.knownfile_comment || '',
                    shareRatio: size > 0 ? transferredAll / size : 0,
                    size,
                    transferred: Number(f.knownfile_xferred || 0),
                    requests: Number(f.knownfile_req_count || 0)
                };
            });
        } catch (error) {
            // Rethrow instead of answering with an empty list: "nothing shared"
            // and "could not ask" look identical in the UI, and the second one
            // must be reported so the page can keep what it already had.
            logRequestFailure(error);
            throw error;
        }
    }

    /**
     * Get uploads list (active uploads)
     */
    async showUploads(): Promise<Upload[]> {
        try {
            await this.ensureConnected();
            const clients = await this.client.getUploadQueue();

            return clients.map((c: any) => ({
                fileName: c.partfile_name || c.client_remote_filename || 'Unknown',
                user: c.client_name || formatIpv4(c.client_user_ip) || 'Unknown',
                speed: Number(c.client_up_speed || 0) / 1024,
                transferred: Number(c.client_upload_session || 0),
                transferredTotal: Number(c.client_upload_total || 0),
                receivedTotal: Number(c.client_download_total || 0),
                userIp: formatIpv4(c.client_user_ip),
                userPort: Number(c.client_user_port || 0),
                clientSoftware: c.client_soft_ver_str || '',
                waitingPosition: Number(c.client_waiting_position || 0),
                score: Number(c.client_score || 0),
                remoteFileName: c.client_remote_filename || '',
                fileHash: typeof c.partfile_hash === 'string' ? c.partfile_hash.toLowerCase() : ''
            }));
        } catch (error) {
            logRequestFailure(error);
            throw error;
        }
    }

    /**
     * Get log entries. EC returns the log as one blob, so split it into lines.
     */
    async showLog(): Promise<string[]> {
        try {
            await this.ensureConnected();
            const log = await this.client.getLog();
            return log.split(/\r?\n/).filter(line => line.trim().length > 0);
        } catch (error) {
            logRequestFailure(error);
            throw error;
        }
    }

    /**
     * Connect the ed2k / Kad networks
     */
    async connect(network?: 'ed2k' | 'kad'): Promise<CommandResult> {
        try {
            await this.ensureConnected();
            const message = await this.client.connectNetwork(network);
            return { success: true, message: message || 'Connecting...' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to connect' };
        }
    }

    /**
     * Disconnect the ed2k / Kad networks
     */
    async disconnect(network?: 'ed2k' | 'kad'): Promise<CommandResult> {
        try {
            await this.ensureConnected();
            const message = await this.client.disconnectNetwork(network);
            return { success: true, message: message || 'Disconnected' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to disconnect' };
        }
    }

    /**
     * Looks for the most recent daemon log line containing `needle`, used to
     * turn a terse EC failure into the reason aMule actually logged.
     */
    private async findLastLogReason(needle: string): Promise<string | null> {
        try {
            const lines = await this.showLog();
            const match = [...lines].reverse().find(line => line.includes(needle));
            // Strip the leading log marker and timestamp, keep the sentence
            return match ? match.replace(/^[!\s]*[\d-]{10}\s[\d:]{8}:\s*/, '').trim() : null;
        } catch {
            return null;
        }
    }

    /**
     * Connect to one specific server, given as "ip:port"
     */
    async connectToServer(address: string): Promise<CommandResult> {
        if (!isValidServerAddress(address)) {
            return { success: false, message: `Invalid server address: '${address}'` };
        }
        try {
            await this.ensureConnected();
            const message = await this.client.connectToServer(address);
            return { success: true, message: message || 'Connecting to server' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to connect to server' };
        }
    }

    /**
     * Remove a server from the list, given as "ip:port"
     */
    async removeServer(address: string): Promise<CommandResult> {
        if (!isValidServerAddress(address)) {
            return { success: false, message: `Invalid server address: '${address}'` };
        }
        try {
            await this.ensureConnected();
            const message = await this.client.removeServer(address);
            return { success: true, message: message || 'Server removed' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to remove server' };
        }
    }

    /**
     * Add a server given as "ip:port", with an optional display name
     */
    async addServer(address: string, name?: string): Promise<CommandResult> {
        if (!isValidServerAddress(address)) {
            return { success: false, message: `Invalid server address, expected ip:port` };
        }
        try {
            await this.ensureConnected();
            const message = await this.client.addServer(address, name);
            return { success: true, message: message || 'Server added' };
        } catch (error: any) {
            // EC only answers "Server not added"; the actual reason (filtered IP,
            // duplicate, bad port) is written to the daemon log.
            const reason = await this.findLastLogReason('Server not added');
            return {
                success: false,
                message: reason || error.message || 'Failed to add server'
            };
        }
    }

    /**
     * Read the configured bandwidth limits (kB/s, 0 = unlimited)
     */
    async getBandwidthLimits(): Promise<BandwidthLimits> {
        await this.ensureConnected();
        const prefs: any = await this.client.getConnectionPreferences();

        return {
            uploadLimit: Number(prefs?.conn_max_ul || 0),
            downloadLimit: Number(prefs?.conn_max_dl || 0)
        };
    }

    /**
     * Set the bandwidth limits (kB/s, 0 = unlimited).
     *
     * The values are validated before they go on the wire and the result is read
     * back from the daemon: EC_OP_SET_PREFERENCES answers with a bare
     * acknowledgement, so a value the daemon clamped or ignored would otherwise
     * be reported as applied. `data` is always what the daemon now holds.
     */
    async setBandwidthLimits(limits: BandwidthLimits): Promise<CommandResult> {
        let upload: number;
        let download: number;
        try {
            upload = normalizeBandwidthLimit(limits?.uploadLimit, 'Upload limit');
            download = normalizeBandwidthLimit(limits?.downloadLimit, 'Download limit');
        } catch (error: any) {
            return { success: false, message: error.message };
        }

        try {
            await this.ensureConnected();
            await this.client.setMaxUpload(upload);
            await this.client.setMaxDownload(download);

            const applied = await this.getBandwidthLimits();
            if (applied.uploadLimit !== upload || applied.downloadLimit !== download) {
                return {
                    success: false,
                    message: `The daemon kept ${applied.uploadLimit} kB/s up and ${applied.downloadLimit} kB/s down instead of ${upload}/${download}`,
                    data: applied
                };
            }

            return {
                success: true,
                message: 'Bandwidth limits updated',
                data: applied
            };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to set bandwidth limits' };
        }
    }

    /**
     * Get current connection status
     */
    async status(): Promise<StatusResult> {
        try {
            await this.ensureConnected();
            const response = await this.client.getStatistics();
            const connState = await this.client.getConnState();

            const stateBits = Number(connState?.value || 0);
            const serverTag: any = connState?.children?.find((c: any) => c.nameEcTag === ECTagNames.EC_TAG_SERVER) || null;
            const [serverIp] = typeof serverTag?.value === 'string' ? serverTag.value.split(':') : [''];
            const ed2kId = Number(connState?.ed2k_id || 0);

            return {
                connected: this.client.getIsConnected(),
                ed2kConnected: (stateBits & ECConnState.ED2K_CONNECTED) !== 0,
                ed2kConnecting: (stateBits & ECConnState.ED2K_CONNECTING) !== 0,
                kadConnected: (stateBits & ECConnState.KAD_CONNECTED) !== 0,
                kadFirewalled: (stateBits & ECConnState.KAD_FIREWALLED) !== 0,
                kadRunning: (stateBits & ECConnState.KAD_RUNNING) !== 0,
                serverName: serverTag?.server_name || '',
                serverIP: serverIp || '',
                // 0xffffffff is reported while still connecting
                id: ed2kId && ed2kId !== 0xffffffff ? String(ed2kId) : '',
                uploadSpeed: Number(response.stats_ul_speed || 0) / 1024,
                downloadSpeed: Number(response.stats_dl_speed || 0) / 1024,
                queuedClients: Number(response.stats_ul_queue_len || 0),
                totalSourceCount: Number(response.stats_total_src_count || 0)
            };
        } catch (error: any) {
            // The pages, the live push and the rate sampler all ask for the
            // status every few seconds, so an unreachable daemon would fill the
            // log with the same stack trace. The banner already tells the user.
            log.debug('Status request failed', error?.message);
            return {
                connected: false,
                ed2kConnected: false,
                kadConnected: false,
                uploadSpeed: 0,
                downloadSpeed: 0,
                queuedClients: 0,
                totalSourceCount: 0
            };
        }
    }

    /**
     * Add a download link
     */
    async addLink(link: string): Promise<CommandResult> {
        const validation = validateDownloadLink(link);
        if (!validation.valid) {
            return {
                success: false,
                message: validation.error || 'Invalid link'
            };
        }

        try {
            await this.ensureConnected();
            const message = await this.client.addLink(link);
            return {
                success: true,
                message: message || 'Link added successfully',
                data: { link }
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to add link'
            };
        }
    }

    /**
     * Pause a download
     */
    async pause(hash: string): Promise<CommandResult> {
        if (!isValidFileHash(hash)) {
            return { success: false, message: `Invalid file hash: '${hash}'` };
        }
        try {
            await this.ensureConnected();
            const message = await this.client.pauseDownload(hash);
            return {
                success: true,
                message: message || 'Download paused'
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to pause download'
            };
        }
    }

    /**
     * Resume a download
     */
    async resume(hash: string): Promise<CommandResult> {
        if (!isValidFileHash(hash)) {
            return { success: false, message: `Invalid file hash: '${hash}'` };
        }
        try {
            await this.ensureConnected();
            const message = await this.client.resumeDownload(hash);
            return {
                success: true,
                message: message || 'Download resumed'
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to resume download'
            };
        }
    }

    /**
     * Cancel a download
     */
    async cancel(hash: string): Promise<CommandResult> {
        if (!isValidFileHash(hash)) {
            return { success: false, message: `Invalid file hash: '${hash}'` };
        }
        try {
            await this.ensureConnected();
            const message = await this.client.cancelDownload(hash);
            return {
                success: true,
                message: message || 'Download cancelled'
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to cancel download'
            };
        }
    }

    /**
     * Set download priority
     */
    async setPriority(hash: string, priority: DownloadPriority): Promise<CommandResult> {
        if (!isValidFileHash(hash)) {
            return { success: false, message: `Invalid file hash: '${hash}'` };
        }
        try {
            await this.ensureConnected();
            const message = await this.client.setPriority(hash, mapPriorityToValue(priority));
            return {
                success: true,
                message: message || `Priority set to ${priority}`
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to set priority'
            };
        }
    }

    /**
     * Starts a search. Results are fetched separately via getSearchResults(),
     * since aMule keeps collecting them for a while after the request returns.
     */
    async search(type: SearchType, keyword: string): Promise<CommandResult> {
        if (!keyword.trim()) {
            return { success: false, message: 'Search keyword is required' };
        }

        try {
            await this.ensureConnected();

            const searchTypeVal = type === 'Global'
                ? ECSearchType.EC_SEARCH_GLOBAL
                : type === 'Local'
                    ? ECSearchType.EC_SEARCH_LOCAL
                    : ECSearchType.EC_SEARCH_KAD;

            const message = await this.client.startSearch(keyword, searchTypeVal);
            this.lastSearchResults = [];
            return { success: true, message: message || 'Search started', data: { type, keyword } };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to start search' };
        }
    }

    /** Stops the running search. */
    async stopSearch(): Promise<CommandResult> {
        try {
            await this.ensureConnected();
            const message = await this.client.stopSearch();
            return { success: true, message: message || 'Search stopped' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to stop search' };
        }
    }

    /**
     * Live results of the running (or last) search, plus its progress.
     */
    async getSearchResults(): Promise<{ results: SearchResult[]; progress: number }> {
        await this.ensureConnected();

        const [files, progress] = await Promise.all([
            this.client.fetchSearchResults(),
            this.client.getSearchProgress()
        ]);

        this.lastSearchResults = files.map((file: any, index: number) => ({
            resultNumber: index,
            hash: typeof file.partfile_hash === 'string' ? file.partfile_hash.toLowerCase() : '',
            fileName: file.partfile_name || 'Unknown',
            size: Number(file.partfile_size_full || 0),
            sources: Number(file.partfile_source_count || 0),
            fileType: file.partfile_ed2k_link ? 'ed2k' : 'Unknown'
        }));

        return { results: this.lastSearchResults, progress };
    }

    /**
     * Get statistics
     */
    async getStatistics(): Promise<Statistics> {
        try {
            await this.ensureConnected();
            const response = await this.client.getStatistics();
            return {
                uptime: 0, // not exposed by EC_OP_STAT_REQ (only via the stats tree)
                totalUploaded: Number(response.stats_total_sent_bytes || 0),
                totalDownloaded: Number(response.stats_total_received_bytes || 0),
                sessionUploaded: 0,
                sessionDownloaded: 0,
                uploadRate: Number(response.stats_ul_speed || 0),
                downloadRate: Number(response.stats_dl_speed || 0),
                uploadLimit: Number(response.stats_ul_speed_limit || 0),
                downloadLimit: Number(response.stats_dl_speed_limit || 0),
                queuedClients: Number(response.stats_ul_queue_len || 0),
                totalSourceCount: Number(response.stats_total_src_count || 0),
                bannedClients: Number(response.stats_banned_count || 0),
                sharedFiles: Number(response.stats_shared_file_count || 0),
                ed2kUsers: Number(response.stats_ed2k_users || 0),
                ed2kFiles: Number(response.stats_ed2k_files || 0),
                kadUsers: Number(response.stats_kad_users || 0),
                kadFiles: Number(response.stats_kad_files || 0)
            };
        } catch (error) {
            logRequestFailure(error);
            throw error;
        }
    }

    /**
     * Download a file from search results
     */
    async download(identifier: number | string): Promise<CommandResult> {
        let hash = '';

        if (typeof identifier === 'number') {
            const result = this.lastSearchResults.find(r => r.resultNumber === identifier);
            if (result) {
                hash = result.hash;
            } else {
                return {
                    success: false,
                    message: `Result number ${identifier} not found in last search results`
                };
            }
        } else {
            hash = identifier;
        }

        return this.downloadSearchResult(hash);
    }

    /** Statistics tree exactly as aMule renders it in its own GUI. */
    async getStatsTree(maxClientVersions = 10): Promise<StatsTreeNode | null> {
        await this.ensureConnected();
        return buildStatsTree(await this.client.getStatsTree(maxClientVersions));
    }

    /**
     * Reads the preferences the UI can edit. aMule sends boolean preferences as
     * empty tags, so a present tag means "enabled".
     */
    async getPreferences(): Promise<AmulePreferences> {
        await this.ensureConnected();

        const [general, connections, servers, directories] = await Promise.all([
            this.client.getPreferenceGroup(ECPrefsSelect.EC_PREFS_GENERAL, ECTagNames.EC_TAG_PREFS_GENERAL),
            this.client.getPreferenceGroup(ECPrefsSelect.EC_PREFS_CONNECTIONS, ECTagNames.EC_TAG_PREFS_CONNECTIONS),
            this.client.getPreferenceGroup(ECPrefsSelect.EC_PREFS_SERVERS, ECTagNames.EC_TAG_PREFS_SERVERS),
            this.client.getPreferenceGroup(ECPrefsSelect.EC_PREFS_DIRECTORIES, ECTagNames.EC_TAG_PREFS_DIRECTORIES)
        ]);

        const flag = (group: any, key: string) => Boolean(group && key in group);

        return {
            nickname: String((general as any)?.user_nick ?? ''),
            userHash: String((general as any)?.user_hash ?? ''),
            connection: {
                maxUpload: Number((connections as any)?.conn_max_ul ?? 0),
                maxDownload: Number((connections as any)?.conn_max_dl ?? 0),
                uploadCapacity: Number((connections as any)?.conn_ul_cap ?? 0),
                downloadCapacity: Number((connections as any)?.conn_dl_cap ?? 0),
                maxConnections: Number((connections as any)?.conn_max_conn ?? 0),
                maxSourcesPerFile: Number((connections as any)?.conn_max_file_sources ?? 0),
                tcpPort: Number((connections as any)?.conn_tcp_port ?? 0),
                udpPort: Number((connections as any)?.conn_udp_port ?? 0),
                autoConnect: flag(connections, 'conn_autoconnect'),
                reconnect: flag(connections, 'conn_reconnect')
            },
            servers: {
                removeDead: flag(servers, 'servers_remove_dead'),
                deadServerRetries: Number((servers as any)?.servers_dead_server_retries ?? 0),
                autoUpdate: flag(servers, 'servers_auto_update'),
                addFromServer: flag(servers, 'servers_add_from_server'),
                addFromClient: flag(servers, 'servers_add_from_client'),
                safeConnect: flag(servers, 'servers_safe_server_connect'),
                autoConnectStaticOnly: flag(servers, 'servers_autoconn_static_only'),
                updateUrl: String((servers as any)?.servers_update_url ?? '')
            },
            directories: {
                incoming: String((directories as any)?.directories_incoming ?? ''),
                temp: String((directories as any)?.directories_temp ?? ''),
                shareHidden: flag(directories, 'directories_share_hidden'),
                autoRescan: flag(directories, 'directories_auto_rescan')
            }
        };
    }

    /** Changes the client nickname. */
    async setNickname(nickname: string): Promise<CommandResult> {
        const trimmed = nickname.trim();
        if (!trimmed) {
            return { success: false, message: 'Nickname cannot be empty' };
        }

        try {
            await this.ensureConnected();
            const message = await this.client.setPreferences(ECTagNames.EC_TAG_PREFS_GENERAL, [
                { tag: ECTagNames.EC_TAG_USER_NICK, type: ECOpCodes.EC_OP_STRINGS, value: trimmed + '\0' }
            ]);
            return { success: true, message: message || 'Nickname updated' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to update nickname' };
        }
    }

    /** Updates connection limits (KB/s, 0 = unlimited) and connection counts. */
    async setConnectionPreferences(values: {
        maxUpload?: number;
        maxDownload?: number;
        maxConnections?: number;
        maxSourcesPerFile?: number;
    }): Promise<CommandResult> {
        const entries: Array<{ tag: number; type: number; value: any }> = [];
        const push = (tag: number, value?: number) => {
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
                entries.push({ tag, type: ECOpCodes.EC_TAGTYPE_UINT32, value: Math.round(value) });
            }
        };

        push(ECTagNames.EC_TAG_CONN_MAX_UL, values.maxUpload);
        push(ECTagNames.EC_TAG_CONN_MAX_DL, values.maxDownload);
        push(ECTagNames.EC_TAG_CONN_MAX_CONN, values.maxConnections);
        push(ECTagNames.EC_TAG_CONN_MAX_FILE_SOURCES, values.maxSourcesPerFile);

        if (entries.length === 0) {
            return { success: false, message: 'No connection settings to change' };
        }

        try {
            await this.ensureConnected();
            const message = await this.client.setPreferences(ECTagNames.EC_TAG_PREFS_CONNECTIONS, entries);
            return { success: true, message: message || 'Connection settings updated' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to update connection settings' };
        }
    }

    /** Updates the server list preferences. */
    async setServerPreferences(values: {
        removeDead?: boolean;
        deadServerRetries?: number;
        autoUpdate?: boolean;
        addFromServer?: boolean;
        addFromClient?: boolean;
        updateUrl?: string;
    }): Promise<CommandResult> {
        const entries: Array<{ tag: number; type: number; value: any }> = [];
        const pushFlag = (tag: number, value?: boolean) => {
            if (typeof value === 'boolean') {
                entries.push({ tag, type: ECOpCodes.EC_TAGTYPE_UINT8, value: value ? 1 : 0 });
            }
        };

        pushFlag(ECTagNames.EC_TAG_SERVERS_REMOVE_DEAD, values.removeDead);
        pushFlag(ECTagNames.EC_TAG_SERVERS_AUTO_UPDATE, values.autoUpdate);
        pushFlag(ECTagNames.EC_TAG_SERVERS_ADD_FROM_SERVER, values.addFromServer);
        pushFlag(ECTagNames.EC_TAG_SERVERS_ADD_FROM_CLIENT, values.addFromClient);

        if (typeof values.deadServerRetries === 'number' && values.deadServerRetries >= 0) {
            entries.push({
                tag: ECTagNames.EC_TAG_SERVERS_DEAD_SERVER_RETRIES,
                type: ECOpCodes.EC_TAGTYPE_UINT8,
                value: Math.min(255, Math.round(values.deadServerRetries))
            });
        }

        if (values.updateUrl) {
            entries.push({
                tag: ECTagNames.EC_TAG_SERVERS_UPDATE_URL,
                type: ECOpCodes.EC_OP_STRINGS,
                value: values.updateUrl.trim() + '\0'
            });
        }

        if (entries.length === 0) {
            return { success: false, message: 'No server settings to change' };
        }

        try {
            await this.ensureConnected();
            const message = await this.client.setPreferences(ECTagNames.EC_TAG_PREFS_SERVERS, entries);
            return { success: true, message: message || 'Server settings updated' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to update server settings' };
        }
    }

    /** Message of the day / info of the connected server. */
    async getServerInfo(): Promise<string[]> {
        await this.ensureConnected();
        const info = await this.client.getServerInfo();
        return info
            .flatMap(entry => entry.split(/\r?\n/))
            .map(line => line.trim())
            .filter(Boolean);
    }

    /** Reloads the server list from a URL (defaults to the configured one). */
    async updateServerListFromUrl(url?: string): Promise<CommandResult> {
        try {
            await this.ensureConnected();
            const target = url?.trim() || (await this.getPreferences()).servers.updateUrl;
            if (!target) {
                return { success: false, message: 'No server list URL configured' };
            }

            const message = await this.client.updateServerListFromUrl(target);
            return { success: true, message: message || `Updating the server list from ${target}` };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to update the server list' };
        }
    }

    /** Starts or stops the Kad network. */
    async setKadRunning(running: boolean): Promise<CommandResult> {
        try {
            await this.ensureConnected();
            const message = running
                ? await this.client.connectNetwork('kad')
                : await this.client.disconnectNetwork('kad');
            return { success: true, message: message || (running ? 'Starting Kad' : 'Kad stopped') };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to change the Kad state' };
        }
    }

    /** Bootstraps Kad from a known node. */
    async bootstrapKad(ip: string, port: number): Promise<CommandResult> {
        try {
            await this.ensureConnected();
            const message = await this.client.bootstrapKadFromIp(ip.trim(), port);
            return { success: true, message: message || `Bootstrapping Kad from ${ip}:${port}` };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to bootstrap Kad' };
        }
    }

    /** Reloads Kad nodes from a nodes.dat URL. */
    async updateKadNodes(url: string): Promise<CommandResult> {
        if (!url.trim()) {
            return { success: false, message: 'A nodes.dat URL is required' };
        }

        try {
            await this.ensureConnected();
            const message = await this.client.updateKadNodesFromUrl(url.trim());
            return { success: true, message: message || 'Updating Kad nodes' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Failed to update Kad nodes' };
        }
    }

    async downloadSearchResult(hash: string): Promise<CommandResult> {
        try {
            await this.ensureConnected();
            const message = await this.client.download(hash);
            return {
                success: true,
                message: message || 'Download started'
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to start download'
            };
        }
    }
}
