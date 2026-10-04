/**
 * amuleapi wire shapes -> the app's own types.
 *
 * The app's types were shaped by EC, and every page, the live push and the MCP
 * tools read them. Translating here, once, is what lets the rest of the app stay
 * unaware of which link answered. Units follow the EC client: speeds in KB/s,
 * timestamps in unix seconds, and a value EC reports as 0 when unknown is 0 here
 * too, while the amuleapi-only extras keep amuleapi's `null` for "unknown".
 */

import type {
    AmulePreferences,
    Download,
    DownloadPriority,
    DownloadStatus,
    MediaInfo,
    SearchResult,
    Server,
    SharedFile,
    StatusResult,
    Upload
} from '../amule-types';
import { buildEd2kLink, fileExtension, fileKind } from '../../../shared/utils/fileKind';
import type {
    ApiDownload,
    ApiMedia,
    ApiPeerClient,
    ApiPreferences,
    ApiSearchResult,
    ApiServer,
    ApiSharedFile,
    ApiStatus
} from './types';

const KB = 1024;

const num = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export function apiMedia(media: ApiMedia | null | undefined): MediaInfo | null | undefined {
    if (media === undefined) return undefined;
    if (media === null) return null;

    return {
        durationSeconds: media.duration_seconds || undefined,
        bitrateKbps: media.bitrate_kilobits_per_second || undefined,
        codec: media.codec || undefined,
        artist: media.artist || undefined,
        album: media.album || undefined,
        title: media.title || undefined
    };
}

/**
 * amuleapi's eleven statuses onto the app's six.
 *
 * "downloading" and "waiting" are split the way the EC client splits them -
 * by whether a source is transferring right now - so a row reads the same
 * whichever link produced it.
 */
export function apiDownloadStatus(status: string, transferring: number): DownloadStatus {
    switch (status) {
        case 'hashing':
            return 'Hashing';
        case 'paused':
        case 'stopped':
            return 'Paused';
        case 'completing':
        case 'completed':
            return 'Complete';
        case 'erroneous':
        case 'insufficient_disk':
            return 'Error';
        default:
            return transferring > 0 ? 'Downloading' : 'Waiting';
    }
}

/** A base level plus an `auto` flag, as both downloads and shared files report it. */
export function apiPriority(priority: string, auto: boolean): DownloadPriority {
    if (auto) return 'Auto';
    switch (priority) {
        case 'very_low':
        case 'low':
            return 'Low';
        case 'high':
        case 'release':
            return 'High';
        default:
            return 'Normal';
    }
}

/** The app's priority label as PATCH /downloads/{hash} spells it. */
export function apiPriorityValue(priority: DownloadPriority): 'low' | 'normal' | 'high' | 'auto' {
    return priority.toLowerCase() as 'low' | 'normal' | 'high' | 'auto';
}

export function apiToDownload(file: ApiDownload): Download {
    const size = num(file.size_bytes);
    const sizeDone = num(file.completed_bytes);
    const transferring = num(file.sources?.transferring);
    const parts = file.progress?.parts;

    const download: Download = {
        hash: String(file.hash).toLowerCase(),
        name: file.name || 'Unknown',
        size,
        sizeDone,
        status: apiDownloadStatus(file.status, transferring),
        priority: apiPriority(file.priority, Boolean(file.priority_auto)),
        autoPriority: Boolean(file.priority_auto),
        speed: num(file.speed_bytes_per_second) / KB,
        sources: num(file.sources?.total),
        sourcesNotCurrent: num(file.sources?.unavailable),
        sourcesA4AF: num(file.sources?.a4af),
        sourcesXfer: transferring,
        percentComplete: typeof file.progress?.percent === 'number'
            ? file.progress.percent
            : size > 0 ? (sizeDone / size) * 100 : 0,
        ed2kLink: file.ed2k_link || '',
        // Detail-only on amuleapi; the list leaves them unknown, which EC spells 0.
        availableParts: num(file.available_part_count),
        stopped: file.status === 'stopped',
        lastReceived: num(file.last_received_at),
        lastSeenComplete: num(file.last_seen_complete_at),
        totalParts: file.total_part_count,
        categoryIndex: file.category_index
    };

    if (parts) {
        download.parts = parts.map(part => ({ state: part.state, sources: num(part.sources) }));
    }

    // Detail fields: copied only when the response carried them, so a list
    // entry never claims to know an ETA it was not given.
    if ('remaining_seconds' in file) download.remainingSeconds = file.remaining_seconds ?? null;
    if (file.active_seconds !== undefined) download.activeSeconds = num(file.active_seconds);
    if (file.directory !== undefined) download.directory = file.directory;
    if (file.part_file_name !== undefined) download.partFileName = file.part_file_name;
    if ('aich_hash' in file) download.aichHash = file.aich_hash ?? null;
    if (file.lost_to_corruption_bytes !== undefined) download.lostToCorruptionBytes = num(file.lost_to_corruption_bytes);
    if (file.gained_by_compression_bytes !== undefined) download.gainedByCompressionBytes = num(file.gained_by_compression_bytes);
    if (file.ich_recovered_packet_count !== undefined) download.ichRecoveredPackets = num(file.ich_recovered_packet_count);
    if (file.upload_queue_count !== undefined) download.uploadQueueCount = num(file.upload_queue_count);
    const media = apiMedia(file.media);
    if (media !== undefined) download.media = media;

    return download;
}

export function apiToSharedFile(file: ApiSharedFile): SharedFile {
    const size = num(file.size_bytes);
    const transferredAll = num(file.uploaded_bytes_total);
    const name = file.name || 'Unknown';

    const shared: SharedFile = {
        fileName: name,
        // The list carries no path; the detail view adds the directory.
        fullPath: file.directory ? `${file.directory.replace(/[/\\]+$/, '')}/${name}` : '',
        hash: String(file.hash ?? '').toLowerCase(),
        // amuleapi addresses files by hash only; uploads name the hash directly.
        ecId: 0,
        size,
        transferred: num(file.uploaded_bytes_session),
        transferredAll,
        requests: num(file.request_count_session),
        requestsAll: num(file.request_count_total),
        accepts: num(file.accepted_request_count_session),
        acceptsAll: num(file.accepted_request_count_total),
        onQueue: num(file.upload_queue_count),
        completeSources: num(file.sources?.complete),
        priority: apiPriority(file.priority, Boolean(file.priority_auto)),
        autoPriority: Boolean(file.priority_auto),
        ed2kLink: file.ed2k_link || buildEd2kLink(name, size, file.hash),
        comment: file.my_comment ?? '',
        shareRatio: size > 0 ? transferredAll / size : 0,
        uploadSpeed: num(file.upload_speed_bytes_per_second) / KB,
        uploadingClients: num(file.uploading_client_count),
        lastUploadAt: file.last_upload_at ?? null,
        sharedSince: file.shared_since_at ?? null
    };

    const media = apiMedia(file.media);
    if (media !== undefined) shared.media = media;
    if (file.directory !== undefined) shared.directory = file.directory;
    if ('parts' in file) shared.partSources = file.parts ? file.parts.map(part => num(part.sources)) : null;
    if (file.my_rating !== undefined) shared.rating = num(file.my_rating);

    return shared;
}

/** amuleapi's locale-free software tokens, spelled the way the clients name themselves. */
const SOFTWARE_NAMES: Record<string, string> = {
    emule: 'eMule',
    cdonkey: 'cDonkey',
    lxmule: 'xMule',
    amule: 'aMule',
    shareaza: 'Shareaza',
    emule_plus: 'eMule Plus',
    hydranode: 'Hydranode',
    mldonkey: 'MLDonkey',
    lphant: 'lphant',
    edonkey_hybrid: 'eDonkeyHybrid',
    edonkey: 'eDonkey',
    old_emule: 'Old eMule',
    compat: 'eMule Compat'
};

export function apiSoftwareLabel(software: string | null | undefined, version: string | null | undefined): string {
    if (!software || software === 'unknown') return version ?? '';
    const name = SOFTWARE_NAMES[software] ?? software;
    if (!version) return name;
    return `${name} ${/^\d/.test(version) ? `v${version}` : version}`;
}

export function apiToUpload(client: ApiPeerClient): Upload {
    return {
        fileName: client.upload_file_name || 'Unknown',
        user: client.name || client.ip || 'Unknown',
        speed: num(client.upload_speed_bytes_per_second) / KB,
        transferred: num(client.uploaded_bytes_session),
        transferredTotal: num(client.uploaded_bytes_total),
        receivedTotal: num(client.downloaded_bytes_total),
        userIp: client.ip ?? '',
        userPort: num(client.port),
        clientSoftware: apiSoftwareLabel(client.software, client.software_version),
        waitingPosition: num(client.upload_queue_position),
        score: num(client.upload_queue_score),
        // The name the peer asked for travels only on the download side.
        remoteFileName: '',
        fileHash: client.upload_file_hash ? client.upload_file_hash.toLowerCase() : '',
        fileEcId: 0,
        countryCode: client.country_code ?? null
    };
}

export function apiToServer(server: ApiServer): Server {
    const priority = server.priority === 'high' ? 'High' : server.priority === 'low' ? 'Low' : 'Normal';

    return {
        name: server.name || server.address || server.ip || 'Unknown',
        ip: server.ip || '',
        port: num(server.port),
        description: server.description || '',
        users: num(server.user_count),
        files: num(server.file_count),
        ping: num(server.ping_ms),
        priority,
        failed: num(server.failed_count),
        static: Boolean(server.permanent),
        countryCode: server.country_code ?? null,
        version: server.software_version ?? null,
        maxUsers: num(server.max_user_count)
    };
}

export function apiToStatus(status: ApiStatus): StatusResult {
    const ed2k = status.ed2k;
    const kad = status.kad;

    return {
        // amuleapi answering is not enough: it is the daemon behind it that counts.
        connected: Boolean(status.ec_connected),
        ed2kConnected: ed2k?.state === 'connected',
        ed2kConnecting: ed2k?.state === 'connecting',
        kadConnected: kad?.state === 'connected',
        kadRunning: Boolean(kad?.state) && kad.state !== 'disabled',
        kadFirewalled: kad?.firewalled_tcp === true,
        serverName: ed2k?.server_name ?? '',
        serverIP: ed2k?.server_ip ?? '',
        id: ed2k?.user_id ? String(ed2k.user_id) : '',
        uploadSpeed: num(status.speeds?.upload_speed_bytes_per_second) / KB,
        downloadSpeed: num(status.speeds?.download_speed_bytes_per_second) / KB,
        queuedClients: num(status.queue?.waiting_upload_client_count),
        totalSourceCount: num(status.queue?.download_source_count),
        highId: ed2k?.state === 'connected' ? Boolean(ed2k.high_id) : undefined,
        tempFreeBytes: status.disk?.temp_free_bytes ?? null,
        incomingFreeBytes: status.disk?.incoming_free_bytes ?? null
    };
}

export function apiToPreferences(prefs: ApiPreferences): AmulePreferences {
    const general = prefs.general ?? {};
    const connection = prefs.connection ?? {};
    const servers = prefs.servers ?? {};
    const directories = prefs.directories ?? {};

    return {
        nickname: general.nickname ?? '',
        userHash: general.user_hash ?? '',
        connection: {
            maxUpload: num(connection.max_upload_kibibytes_per_second),
            maxDownload: num(connection.max_download_kibibytes_per_second),
            maxConnections: num(connection.max_connection_count),
            maxSourcesPerFile: num(connection.max_sources_per_file_count),
            tcpPort: num(connection.tcp_port),
            udpPort: num(connection.udp_port),
            autoConnect: Boolean(connection.autoconnect),
            reconnect: Boolean(connection.reconnect_on_connection_loss)
        },
        servers: {
            removeDead: Boolean(servers.remove_dead_servers),
            deadServerRetries: num(servers.dead_server_retry_count),
            autoUpdate: Boolean(servers.update_list_at_startup),
            addFromServer: Boolean(servers.update_list_from_server),
            addFromClient: Boolean(servers.update_list_from_client),
            safeConnect: Boolean(servers.safe_server_connect_enabled),
            autoConnectStaticOnly: Boolean(servers.autoconnect_static_servers_only),
            updateUrl: servers.update_url ?? ''
        },
        directories: {
            incoming: directories.incoming_path ?? '',
            temp: directories.temp_path ?? '',
            shareHidden: Boolean(directories.share_hidden),
            autoRescan: Boolean(directories.rescan_on_startup)
        }
    };
}

export function apiToSearchResult(result: ApiSearchResult, index: number): SearchResult {
    const hash = String(result.hash ?? '').toLowerCase();
    const fileName = result.name || 'Unknown';
    const size = num(result.size_bytes);

    return {
        resultNumber: index,
        hash,
        fileName,
        size,
        sources: num(result.sources?.total),
        // Classified by the app's own rules so the filters match the EC path.
        fileType: fileKind(fileName),
        extension: fileExtension(fileName),
        ed2kLink: buildEd2kLink(fileName, size, hash),
        completeSources: num(result.sources?.complete),
        alreadyDownloaded: Boolean(result.already_downloaded),
        rating: num(result.rating),
        media: apiMedia(result.media) ?? null
    };
}
