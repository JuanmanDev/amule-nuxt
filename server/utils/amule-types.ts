/**
 * TypeScript type definitions for the aMule External Connection client.
 */

// ========== Base Types ==========

export interface AmuleConfig {
    host: string;
    port: string | number;
    password: string;
    executablePath?: string;
}

export interface CommandResult {
    success: boolean;
    message: string;
    data?: any;
}

// ========== Connection & Status ==========

/**
 * Which link answered: amuleapi (the REST daemon aMule 3.1 ships) or the
 * External Connection every aMule speaks. See `server/utils/amule-backend.ts`.
 */
export type AmuleTransport = 'amuleapi' | 'ec';

/**
 * Audio/video metadata amuled probed with ffprobe (aMule 3.1+, amuleapi only).
 * Every field is optional: a file can carry a codec and nothing else.
 */
export interface MediaInfo {
    durationSeconds?: number;
    bitrateKbps?: number;
    codec?: string;
    artist?: string;
    album?: string;
    title?: string;
}

export interface StatusResult {
    /** True when the External Connection to the daemon is up. */
    connected: boolean;
    ed2kConnected: boolean;
    /** True while the ed2k connection is still being established. */
    ed2kConnecting?: boolean;
    kadConnected: boolean;
    /** Kad is running but may not have contacts yet. */
    kadRunning?: boolean;
    kadFirewalled?: boolean;
    serverName?: string;
    serverIP?: string;
    id?: string;
    uploadSpeed: number;
    downloadSpeed: number;
    queuedClients: number;
    totalSourceCount: number;
    /** The link that produced this reading. */
    transport?: AmuleTransport;
    /** True for a HighID; only amuleapi reports it. */
    highId?: boolean;
    /** Free bytes where part files live, null when the daemon has no figure (amuleapi only). */
    tempFreeBytes?: number | null;
    /** Free bytes in the default Incoming directory (amuleapi only). */
    incomingFreeBytes?: number | null;
}

// ========== Download Management ==========

export type DownloadPriority = 'Auto' | 'High' | 'Normal' | 'Low';

export type DownloadStatus =
    | 'Downloading'
    | 'Paused'
    | 'Complete'
    | 'Hashing'
    | 'Error'
    | 'Waiting';

/**
 * State of one ~9.28 MiB chunk of a downloading file.
 *
 * `pending` is a gap that at least one source offers, `unavailable` a gap
 * nobody in the swarm has. Only amuleapi reports this: the EC link carries a
 * part count and never a per-part map.
 */
export type DownloadPartState = 'complete' | 'pending' | 'unavailable';

export interface DownloadPart {
    state: DownloadPartState;
    /** Clients in the swarm currently offering this chunk. */
    sources: number;
}

export interface Download {
    hash: string;
    name: string;
    size: number;
    sizeDone: number;
    status: DownloadStatus;
    priority: DownloadPriority;
    /** True when aMule manages the priority automatically. */
    autoPriority: boolean;
    speed: number;
    sources: number;
    sourcesNotCurrent: number;
    sourcesA4AF: number;
    sourcesXfer: number;
    percentComplete: number;
    /** Link aMule reports for this file, useful to verify a hand pasted hash. */
    ed2kLink: string;
    /** Parts currently available across all sources. */
    availableParts: number;
    /** True when the download was stopped rather than paused. */
    stopped: boolean;
    /** Unix seconds of the last received data, 0 when nothing was ever received. */
    lastReceived: number;
    /** Unix seconds when the file was last seen complete on a source. */
    lastSeenComplete: number;

    /**
     * One entry per ~9.28 MiB chunk, straight from amuleapi
     * (`GET /api/v1/downloads/{hash}` -> `progress.parts`). Undefined when only
     * the EC link is answering: EC sends a part *count* (availableParts), never
     * a per-part map, so its absence is the fallback, not a bug.
     */
    parts?: DownloadPart[];
    /** How many chunks `parts` covers; `ceil(size / 9.28 MiB)` per amuleapi. */
    totalParts?: number;

    /*
     * Detail-only fields amuleapi adds on GET /downloads/{hash}. EC has no
     * equivalent, so each is undefined on the EC path.
     */

    /** The daemon's own ETA in seconds; null when stalled or paused. */
    remainingSeconds?: number | null;
    /** Seconds spent actively downloading. */
    activeSeconds?: number;
    /** Directory the file lives in: Temp while downloading. */
    directory?: string;
    /** The `.part` control file name, e.g. `001.part`. */
    partFileName?: string;
    aichHash?: string | null;
    lostToCorruptionBytes?: number;
    gainedByCompressionBytes?: number;
    /** Packets rescued by Intelligent Corruption Handling. */
    ichRecoveredPackets?: number;
    /** Clients waiting on this file's upload queue (it is shared while downloading). */
    uploadQueueCount?: number;
    categoryIndex?: number;
    media?: MediaInfo | null;

    /*
     * Timestamps this app records itself, in epoch ms. aMule reports neither: a
     * partfile says when data last arrived, never when the download began. See
     * `server/utils/downloadHistory.ts`.
     */

    /** When it joined the queue, if that was actually observed. */
    addedAt?: number;
    /** When it finished, if that was observed. */
    completedAt?: number;
    /** When this app first saw the hash, whatever its state was then. */
    firstSeenAt?: number;
    /**
     * True when `addedAt` is a real start time. False for a download that was
     * already queued the first time this app looked - it began at some unknown
     * point before `firstSeenAt`.
     */
    startKnown?: boolean;
}

// ========== Upload Management ==========

export interface Upload {
    fileName: string;
    user: string;
    speed: number;
    /** Bytes sent to this client in the current session. */
    transferred: number;
    /** Bytes sent to this client over all sessions. */
    transferredTotal: number;
    /** Bytes received from this client over all sessions. */
    receivedTotal: number;
    userIp: string;
    userPort: number;
    clientSoftware: string;
    /** Position in the upload queue, 0 when actively uploading. */
    waitingPosition: number;
    score: number;
    /** Name the remote client requested, when it differs from the shared name. */
    remoteFileName: string;
    /**
     * Hash of the file being sent, when the daemon reported one. Older daemons
     * send only the numeric id below, and the hash is resolved through the
     * shared list instead.
     */
    fileHash: string;
    /** The daemon's numeric id (ECID) of the file being sent, 0 when unknown. */
    fileEcId: number;
    /** ISO 3166-1 alpha-2, lower case, resolved by the daemon's GeoIP (amuleapi only). */
    countryCode?: string | null;
}

export interface SharedFile {
    fileName: string;
    fullPath: string;
    hash: string;
    /** The daemon's numeric id (ECID) for this file; upload records point at it. */
    ecId: number;
    size: number;
    /** Bytes sent for this file in the current session / over all sessions. */
    transferred: number;
    transferredAll: number;
    requests: number;
    requestsAll: number;
    accepts: number;
    acceptsAll: number;
    /** Clients currently queued for this file. */
    onQueue: number;
    completeSources: number;
    priority: string;
    autoPriority: boolean;
    ed2kLink: string;
    comment: string;
    /** Bytes sent divided by file size. */
    shareRatio: number;

    /** Epoch ms this file finished downloading, when this app saw it happen. */
    completedAt?: number;
    /** Epoch ms it was added to the queue, when this app saw it happen. */
    addedAt?: number;

    /*
     * amuleapi-only. The list carries the live upload figures; the detail view
     * (GET /api/amule/shared/{hash}) adds the rest.
     */

    /** Combined upload rate for this file, KB/s. */
    uploadSpeed?: number;
    /** Clients this file is being uploaded to right now. */
    uploadingClients?: number;
    /** Unix seconds of the last byte sent, null when it never uploaded. */
    lastUploadAt?: number | null;
    /** Unix seconds it was completed or first shared. */
    sharedSince?: number | null;
    media?: MediaInfo | null;
    /** Directory on the daemon's disk (detail only). */
    directory?: string;
    /** Per part, how many requesting clients hold it (detail only). */
    partSources?: number[] | null;
    /** The user's own rating, 0-5 (detail only). */
    rating?: number;
}

export interface AmulePreferences {
    nickname: string;
    userHash: string;
    connection: {
        maxUpload: number;
        maxDownload: number;
        /** Line capacity that scales the graphs. EC only: amuleapi does not expose it. */
        uploadCapacity?: number;
        downloadCapacity?: number;
        maxConnections: number;
        maxSourcesPerFile: number;
        tcpPort: number;
        udpPort: number;
        autoConnect: boolean;
        reconnect: boolean;
    };
    servers: {
        removeDead: boolean;
        deadServerRetries: number;
        autoUpdate: boolean;
        addFromServer: boolean;
        addFromClient: boolean;
        safeConnect: boolean;
        autoConnectStaticOnly: boolean;
        updateUrl: string;
    };
    directories: {
        incoming: string;
        temp: string;
        shareHidden: boolean;
        autoRescan: boolean;
    };
}

// ========== Search Operations ==========

export type SearchType = 'Global' | 'Kad' | 'Local';

export interface SearchResult {
    resultNumber: number;
    hash: string;
    fileName: string;
    size: number;
    sources: number;
    /*
     * No "complete sources" field: aMule's search results carry a source count
     * and nothing that distinguishes a complete source from a partial one. The
     * tag that looks like it (SOURCE_COUNT_XFER) is 0 for every search result on
     * a live daemon - see getSearchResults.
     */
    /** Broad kind guessed from the extension: video, audio, archive... */
    fileType?: string;
    /** Extension without the dot, lower case; empty when the name has none. */
    extension?: string;
    /**
     * The link for this result, built from its name, size and hash.
     *
     * The daemon does not send one, and it is what everything downstream deals in:
     * copying, sharing, and adding the file by link rather than by search index.
     */
    ed2kLink: string;

    /*
     * amuleapi-only: EC's search results carry none of these (see the note on
     * `sources` above about SOURCE_COUNT_XFER).
     */

    /** Sources that hold the whole file. */
    completeSources?: number;
    /** True when the file is already queued, downloaded or shared here. */
    alreadyDownloaded?: boolean;
    /** Aggregated quality rating, 0 when unrated. */
    rating?: number;
    /** Metadata the answering server advertised - a hint, not a probe. */
    media?: MediaInfo | null;
}

export interface ProgressResult {
    searchProgress: number;
    resultsCount: number;
    searching: boolean;
}

// ========== Server Management ==========

export interface Server {
    name: string;
    ip: string;
    port: number;
    description: string;
    users: number;
    files: number;
    ping?: number;
    priority: 'High' | 'Normal' | 'Low';
    failed: number;
    static: boolean;
    /** amuleapi-only extras. */
    countryCode?: string | null;
    version?: string | null;
    maxUsers?: number;
}

// ========== Logs & Statistics ==========

export interface LogEntry {
    timestamp: Date;
    level: 'INFO' | 'WARN' | 'ERROR';
    message: string;
}

export interface Statistics {
    uptime: number;
    totalUploaded: number;
    totalDownloaded: number;
    sessionUploaded: number;
    sessionDownloaded: number;
    uploadRate: number;
    downloadRate: number;
    uploadLimit: number;
    downloadLimit: number;
    /** Clients waiting in the upload queue */
    queuedClients: number;
    /** Sources found across the download queue */
    totalSourceCount: number;
    bannedClients: number;
    sharedFiles: number;
    ed2kUsers: number;
    ed2kFiles: number;
    kadUsers: number;
    kadFiles: number;
}

// ========== Configuration ==========

export interface BandwidthLimits {
    uploadLimit: number;    // KB/s, 0 = unlimited
    downloadLimit: number;  // KB/s, 0 = unlimited
}

export interface IPFilterConfig {
    enabled: boolean;
    autoUpdate: boolean;
    url?: string;
    level: number;
}

// ========== Error Types ==========

export class AmuleError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AmuleError';
    }
}

export class AmuleConnectionError extends AmuleError {
    constructor(message: string = 'Failed to connect to aMule daemon') {
        super(message);
        this.name = 'AmuleConnectionError';
    }
}

export class AmuleCommandError extends AmuleError {
    constructor(command: string, message: string) {
        super(`Command '${command}' failed: ${message}`);
        this.name = 'AmuleCommandError';
    }
}

export class AmuleParseError extends AmuleError {
    constructor(message: string, rawOutput?: string) {
        super(`Failed to parse aMule output: ${message}`);
        this.name = 'AmuleParseError';
        if (rawOutput) {
            this.stack += `\n\nRaw Output:\n${rawOutput}`;
        }
    }
}

export class AmuleTimeoutError extends AmuleError {
    constructor(command: string, timeout: number) {
        super(`Command '${command}' timed out after ${timeout}ms`);
        this.name = 'AmuleTimeoutError';
    }
}
