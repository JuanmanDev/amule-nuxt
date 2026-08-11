import * as net from 'net';
import { useLogger } from '../../logger';
import * as crypto from 'crypto';

// Types and Interfaces
export interface ECResponse {
    header: number;
    totalSizeOfRequest: number;
    opCode: number;
    opCodeLabel?: string;
    tagCountInResponse: number;
    length: number;
    children: ECResponse[];
    nameEcTag: number;
    value: any;
    typeEcOp: number;
    [key: string]: any; // Allow dynamic properties for formatted results
}

export interface ECConfig {
    host: string;
    port: number;
    password: string;
}

/**
 * How long to wait for the TCP handshake. The daemon usually sits on the LAN,
 * so a slow handshake means it is gone; waiting longer only makes every page
 * that asks for data wait with it.
 */
const CONNECT_TIMEOUT_MS = 3000;

/** How long to wait for the daemon's answer to a request already sent. */
const REQUEST_TIMEOUT_MS = 10000;

// Constants
// Opcode values below mirror aMule's src/libs/ec/cpp/ECCodes.h exactly.
export const ECDetailLevel = {
    EC_DETAIL_CMD: 0x00,
    EC_DETAIL_WEB: 0x01,
    EC_DETAIL_FULL: 0x02,
    EC_DETAIL_UPDATE: 0x03,
    EC_DETAIL_INC_UPDATE: 0x04
} as const;

/** Bits of the EC_TAG_CONNSTATE value (see CEC_ConnState_Tag in aMule). */
export const ECConnState = {
    ED2K_CONNECTED: 0x01,
    ED2K_CONNECTING: 0x02,
    KAD_CONNECTED: 0x04,
    KAD_FIREWALLED: 0x08,
    KAD_RUNNING: 0x10
} as const;

export const ECCodes = {
    EC_CURRENT_PROTOCOL_VERSION: 0x0204,
    EC_OP_AUTH_REQ: 0x02,
    EC_OP_GET_CONNSTATE: 0x0B,
    EC_OP_ADD_LINK: 0x09,
    EC_OP_GET_DLOAD_QUEUE: 0x0D,
    EC_OP_GET_ULOAD_QUEUE: 0x0E,
    EC_OP_GET_SHARED_FILES: 0x10,
    EC_OP_PARTFILE_PAUSE: 0x19,
    EC_OP_PARTFILE_RESUME: 0x1A,
    EC_OP_PARTFILE_STOP: 0x1B,
    EC_OP_PARTFILE_PRIO_SET: 0x1C,
    EC_OP_GET_SERVER_LIST: 0x2C,
    EC_OP_SERVER_REMOVE: 0x30,
    EC_OP_SERVER_ADD: 0x31,
    EC_OP_SERVER_CONNECT: 0x2F,
    EC_OP_SERVER_UPDATE_FROM_URL: 0x32,
    EC_OP_GET_SERVERINFO: 0x37,
    EC_OP_GET_STATSTREE: 0x46,
    EC_OP_KAD_UPDATE_FROM_URL: 0x4D,
    EC_OP_KAD_BOOTSTRAP_FROM_IP: 0x4E
} as const;

export const ECOpCodes = {
    EC_OP_STRINGS: 0x06,
    EC_TAGTYPE_UINT16: 0x03,
    EC_TAGTYPE_CUSTOM: 1,
    EC_TAGTYPE_UINT8: 2,
    EC_TAGTYPE_UINT32: 4,
    EC_TAGTYPE_DOUBLE: 0x07,
    EC_TAGTYPE_IPV4: 0x08,
    EC_TAGTYPE_HASH16: 0x09,
    EC_TAGTYPE_UINT128: 0x0A,
    EC_OP_AUTH_FAIL: 0x03,
    EC_OP_AUTH_OK: 0x04,
    EC_OP_SEARCH_START: 0x26,
    EC_OP_SEARCH_STOP: 0x27,
    EC_OP_SEARCH_RESULTS: 0x28,
    EC_OP_SEARCH_PROGRESS: 0x29,
    EC_OP_DOWNLOAD_SEARCH_RESULT: 0x2A,
    EC_OP_FAILED: 0x05,
    EC_OP_NOOP: 0x01,
    EC_OP_DLOAD_QUEUE: 0x1F, // 31 - response opcode only
    EC_OP_SERVER_LIST: 0x2D, // 45 - response opcode only
    EC_OP_STAT_REQ: 0x0A, // 10
    EC_OP_GET_UPDATE: 0x52, // 82
    EC_OP_GET_PREFERENCES: 0x3F, // 63
    EC_OP_SET_PREFERENCES: 0x40, // 64
    EC_OP_PARTFILE_DELETE: 0x1D, // 29
    EC_OP_SHAREDFILES_RELOAD: 0x23, // 35
    EC_OP_GET_LOG: 0x35, // 53
    EC_OP_KAD_START: 0x48, // 72
    EC_OP_KAD_STOP: 0x49, // 73
    EC_OP_CONNECT: 0x4A, // 74
    EC_OP_DISCONNECT: 0x4B, // 75
    EC_OP_CLEAR_COMPLETED: 0x53 // 83
} as const;

/** Preference groups selectable through EC_TAG_SELECT_PREFS. */
export const ECPrefsSelect = {
    EC_PREFS_CATEGORIES: 0x00000001,
    EC_PREFS_GENERAL: 0x00000002,
    EC_PREFS_CONNECTIONS: 0x00000004,
    EC_PREFS_MESSAGEFILTER: 0x00000008,
    EC_PREFS_REMOTECONTROLS: 0x00000010,
    EC_PREFS_ONLINESIG: 0x00000020,
    EC_PREFS_SERVERS: 0x00000040,
    EC_PREFS_FILES: 0x00000080,
    EC_PREFS_DIRECTORIES: 0x00000200,
    EC_PREFS_STATISTICS: 0x00000400,
    EC_PREFS_SECURITY: 0x00000800,
    EC_PREFS_CORETWEAKS: 0x00001000,
    EC_PREFS_KADEMLIA: 0x00002000
} as const;

/** Value types of a statistics tree node (EC_TAG_STAT_VALUE_TYPE). */
export const ECStatValueType = {
    EC_VALUE_INTEGER: 0x00,
    EC_VALUE_ISTRING: 0x01,
    EC_VALUE_BYTES: 0x02,
    EC_VALUE_ISHORT: 0x03,
    EC_VALUE_TIME: 0x04,
    EC_VALUE_SPEED: 0x05,
    EC_VALUE_STRING: 0x06,
    EC_VALUE_DOUBLE: 0x07
} as const;

// Partfile status codes (aMule src/Constants.h PS_*)
export const ECPartFileStatus = {
    PS_READY: 0,
    PS_EMPTY: 1,
    PS_WAITING_FOR_HASH: 2,
    PS_HASHING: 3,
    PS_ERROR: 4,
    PS_INSUFFICIENT: 5,
    PS_UNKNOWN: 6,
    PS_PAUSED: 7,
    PS_COMPLETING: 8,
    PS_COMPLETE: 9,
    PS_ALLOCATING: 10
} as const;

// Download priorities (aMule src/Constants.h PR_*)
export const ECPriority = {
    PR_LOW: 0,
    PR_NORMAL: 1,
    PR_HIGH: 2,
    PR_VERYHIGH: 3,
    PR_VERY_LOW: 4,
    PR_AUTO: 5
} as const;

export const ECTagNames = {
    EC_TAG_STRING: 0x0000,
    EC_TAG_CLIENT_NAME: 0x0100,
    EC_TAG_CLIENT_VERSION: 0x0101,
    EC_TAG_PROTOCOL_VERSION: 0x0002,
    EC_TAG_PASSWD_HASH: 0x0001,
    EC_TAG_DETAIL_LEVEL: 0x0004,
    EC_TAG_CONNSTATE: 0x0005,
    EC_TAG_SERVER: 0x0500,
    EC_TAG_PARTFILE: 0x0300,
    EC_TAG_PARTFILE_PRIO: 0x0309,
    EC_TAG_PARTFILE_CAT: 0x030F,
    EC_TAG_SERVER_NAME: 0x0501,
    EC_TAG_SERVER_ADDRESS: 0x0503,
    EC_TAG_SELECT_PREFS: 0x1000,
    EC_TAG_PREFS_GENERAL: 0x1200,
    EC_TAG_USER_NICK: 0x1201,
    EC_TAG_PREFS_CONNECTIONS: 0x1300,
    EC_TAG_CONN_DL_CAP: 0x1301,
    EC_TAG_CONN_UL_CAP: 0x1302,
    EC_TAG_CONN_MAX_DL: 0x1303,
    EC_TAG_CONN_MAX_UL: 0x1304,
    EC_TAG_CONN_TCP_PORT: 0x1306,
    EC_TAG_CONN_UDP_PORT: 0x1307,
    EC_TAG_CONN_MAX_FILE_SOURCES: 0x1309,
    EC_TAG_CONN_MAX_CONN: 0x130A,
    EC_TAG_CONN_AUTOCONNECT: 0x130B,
    EC_TAG_CONN_RECONNECT: 0x130C,
    EC_TAG_PREFS_SERVERS: 0x1700,
    EC_TAG_SERVERS_REMOVE_DEAD: 0x1701,
    EC_TAG_SERVERS_DEAD_SERVER_RETRIES: 0x1702,
    EC_TAG_SERVERS_AUTO_UPDATE: 0x1703,
    EC_TAG_SERVERS_URL_LIST: 0x1704,
    EC_TAG_SERVERS_ADD_FROM_SERVER: 0x1705,
    EC_TAG_SERVERS_ADD_FROM_CLIENT: 0x1706,
    EC_TAG_SERVERS_SAFE_SERVER_CONNECT: 0x1709,
    EC_TAG_SERVERS_AUTOCONN_STATIC_ONLY: 0x170A,
    EC_TAG_SERVERS_UPDATE_URL: 0x170C,
    EC_TAG_PREFS_DIRECTORIES: 0x1A00,
    EC_TAG_DIRECTORIES_INCOMING: 0x1A01,
    EC_TAG_DIRECTORIES_TEMP: 0x1A02,
    EC_TAG_STATTREE_CAPPING: 0x1B05,
    EC_TAG_STATTREE_NODE: 0x1B06,
    EC_TAG_STAT_NODE_VALUE: 0x1B07,
    EC_TAG_STAT_VALUE_TYPE: 0x1B08,
    EC_TAG_PREFS_KADEMLIA: 0x1E00,
    EC_TAG_KADEMLIA_UPDATE_URL: 0x1E01,
    EC_TAG_BOOTSTRAP_IP: 0x0008,
    EC_TAG_BOOTSTRAP_PORT: 0x0009
} as const;

export const ECSearchType = {
    EC_SEARCH_LOCAL: 0x00,
    EC_SEARCH_GLOBAL: 0x01,
    EC_SEARCH_KAD: 0x02,
    EC_SEARCH_WEB: 0x03
} as const;

export const ECTagSearchFile = {
    EC_TAG_SEARCH_TYPE: 0x0701,
    EC_TAG_SEARCH_NAME: 0x0702,
    EC_TAG_SEARCH_MIN_SIZE: 0x0703,
    EC_TAG_SEARCH_MAX_SIZE: 0x0704,
    EC_TAG_SEARCH_FILE_TYPE: 0x0705,
    EC_TAG_SEARCH_EXTENSION: 0x0706,
    EC_TAG_SEARCH_AVAILABILITY: 0x0707,
    EC_TAG_SEARCH_STATUS: 0x0708,
    EC_TAG_SEARCH_PARENT: 0x0709
} as const;

// Tag Mapping for friendly names
export const ECTagMapping: { [key: string]: number }[] = [
    { EC_TAG_PARTFILE_NAME: 769 }, { EC_TAG_PARTFILE_SIZE_DONE: 774 }, { EC_TAG_PARTFILE_SPEED: 775 }, { EC_TAG_PARTFILE_LAST_SEEN_COMP: 785 },
    { EC_TAG_PARTFILE_LAST_RECV: 784 }, { EC_TAG_PARTFILE_COMMENTS: 790 }, { EC_TAG_PARTFILE_HASH: 798 }, { EC_TAG_PARTFILE_SIZE_FULL: 771 }, { EC_TAG_PARTFILE_ED2K_LINK: 782 },
    { EC_TAG_PARTFILE_SOURCE_COUNT: 778 }, { EC_TAG_PARTFILE_SOURCE_COUNT_XFER: 781 }, { EC_TAG_PARTFILE_STATUS: 776 },
    { EC_TAG_PARTFILE_SOURCE_COUNT_A4AF: 779 }, { EC_TAG_PARTFILE_SOURCE_COUNT_NOT_CURRENT: 780 },
    { EC_TAG_PARTFILE_SIZE_XFER: 772 }, { EC_TAG_PARTFILE_STOPPED: 791 }, { EC_TAG_PARTFILE_AVAILABLE_PARTS: 797 },
    { EC_TAG_KNOWNFILE_FILENAME: 1032 }, { EC_TAG_KNOWNFILE_XFERRED_ALL: 1026 }, { EC_TAG_KNOWNFILE_REQ_COUNT_ALL: 1028 },
    { EC_TAG_PREFS_GENERAL: 4608 }, { EC_TAG_USER_NICK: 4609 }, { EC_TAG_USER_HASH: 4610 },
    { EC_TAG_PREFS_CONNECTIONS: 4864 }, { EC_TAG_CONN_MAX_UL: 4868 }, { EC_TAG_CONN_MAX_DL: 4867 }, { EC_TAG_CLIENT: 1536 }, { EC_TAG_CLIENT_NAME: 256 },
    { EC_TAG_CLIENT_HASH: 1539 }, { EC_TAG_CLIENT_USER_ID: 1566 }, { EC_TAG_CLIENT_SOFTWARE: 1537 }, { EC_TAG_CLIENT_SOFT_VER_STR: 1557 },
    { EC_TAG_CLIENT_USER_IP: 1552 }, { EC_TAG_CLIENT_USER_PORT: 1553 }, { EC_TAG_CLIENT_DISABLE_VIEW_SHARED: 1563 }, { EC_TAG_CLIENT_OS_INFO: 1577 },
    { EC_TAG_CLIENT_SCORE: 1538 }, { EC_TAG_CLIENT_UPLOAD_SESSION: 1545 }, { EC_TAG_CLIENT_UPLOAD_TOTAL: 1546 },
    { EC_TAG_CLIENT_DOWNLOAD_TOTAL: 1547 }, { EC_TAG_CLIENT_DOWNLOAD_STATE: 1548 }, { EC_TAG_CLIENT_UP_SPEED: 1549 },
    { EC_TAG_CLIENT_DOWN_SPEED: 1550 }, { EC_TAG_CLIENT_SERVER_NAME: 1556 }, { EC_TAG_CLIENT_WAITING_POSITION: 1558 },
    { EC_TAG_CLIENT_UPLOAD_STATE: 1564 }, { EC_TAG_CLIENT_UPLOAD_FILE: 1567 }, { EC_TAG_CLIENT_REMOTE_FILENAME: 1575 },
    { EC_TAG_SERVER: 1280 }, { EC_TAG_STATS_LOGGER_MESSAGE: 525 }, { EC_TAG_STATS_TOTAL_SENT_BYTES: 536 }, { EC_TAG_STATS_TOTAL_RECEIVED_BYTES: 537 },
    { EC_TAG_STATS_UL_SPEED: 512 }, { EC_TAG_STATS_DL_SPEED: 513 }, { EC_TAG_STATS_UL_SPEED_LIMIT: 514 }, { EC_TAG_STATS_DL_SPEED_LIMIT: 515 },
    { EC_TAG_STATS_UP_OVERHEAD: 516 }, { EC_TAG_STATS_DOWN_OVERHEAD: 517 }, { EC_TAG_STATS_TOTAL_SRC_COUNT: 518 },
    { EC_TAG_STATS_BANNED_COUNT: 519 }, { EC_TAG_STATS_UL_QUEUE_LEN: 520 }, { EC_TAG_STATS_ED2K_USERS: 521 },
    { EC_TAG_STATS_KAD_USERS: 522 }, { EC_TAG_STATS_ED2K_FILES: 523 }, { EC_TAG_STATS_KAD_FILES: 524 },
    { EC_TAG_STATS_SHARED_FILE_COUNT: 538 },
    { EC_TAG_PREFS_DIRECTORIES: 6656 }, { EC_TAG_DIRECTORIES_INCOMING: 6657 }, { EC_TAG_DIRECTORIES_TEMP: 6658 },
    { EC_TAG_DIRECTORIES_SHARED: 6659 }, { EC_TAG_DIRECTORIES_SHARE_HIDDEN: 6660 }, { EC_TAG_DIRECTORIES_AUTO_RESCAN: 6661 },
    // Connection preferences (0x1301..0x130C)
    { EC_TAG_CONN_DL_CAP: 4865 }, { EC_TAG_CONN_UL_CAP: 4866 }, { EC_TAG_CONN_SLOT_ALLOCATION: 4869 },
    { EC_TAG_CONN_TCP_PORT: 4870 }, { EC_TAG_CONN_UDP_PORT: 4871 }, { EC_TAG_CONN_UDP_DISABLE: 4872 },
    { EC_TAG_CONN_MAX_FILE_SOURCES: 4873 }, { EC_TAG_CONN_MAX_CONN: 4874 },
    { EC_TAG_CONN_AUTOCONNECT: 4875 }, { EC_TAG_CONN_RECONNECT: 4876 },
    // Server preferences (0x1700..0x170C)
    { EC_TAG_PREFS_SERVERS: 5888 }, { EC_TAG_SERVERS_REMOVE_DEAD: 5889 }, { EC_TAG_SERVERS_DEAD_SERVER_RETRIES: 5890 },
    { EC_TAG_SERVERS_AUTO_UPDATE: 5891 }, { EC_TAG_SERVERS_URL_LIST: 5892 }, { EC_TAG_SERVERS_ADD_FROM_SERVER: 5893 },
    { EC_TAG_SERVERS_ADD_FROM_CLIENT: 5894 }, { EC_TAG_SERVERS_USE_SCORE_SYSTEM: 5895 }, { EC_TAG_SERVERS_SMART_ID_CHECK: 5896 },
    { EC_TAG_SERVERS_SAFE_SERVER_CONNECT: 5897 }, { EC_TAG_SERVERS_AUTOCONN_STATIC_ONLY: 5898 },
    { EC_TAG_SERVERS_MANUAL_HIGH_PRIO: 5899 }, { EC_TAG_SERVERS_UPDATE_URL: 5900 },
    // Kad preferences + stats tree nodes
    { EC_TAG_PREFS_KADEMLIA: 7680 }, { EC_TAG_KADEMLIA_UPDATE_URL: 7681 },
    { EC_TAG_STATTREE_NODE: 6918 }, { EC_TAG_STAT_NODE_VALUE: 6919 }, { EC_TAG_STAT_VALUE_TYPE: 6921 },
    // Additional shared / known file details
    { EC_TAG_KNOWNFILE_REQ_COUNT: 1027 }, { EC_TAG_KNOWNFILE_ACCEPT_COUNT: 1029 }, { EC_TAG_KNOWNFILE_ACCEPT_COUNT_ALL: 1030 },
    { EC_TAG_KNOWNFILE_XFERRED: 1025 }, { EC_TAG_KNOWNFILE_PRIO: 1035 }, { EC_TAG_KNOWNFILE_COMPLETE_SOURCES: 1037 },
    { EC_TAG_KNOWNFILE_ON_QUEUE: 1036 }, { EC_TAG_KNOWNFILE_COMMENT: 1038 }, { EC_TAG_KNOWNFILE_RATING: 1039 },
    { EC_TAG_PARTFILE_PRIO: 777 },
    // Server list tags (EC_TAG_SERVER_* = 0x0501..0x050D)
    { EC_TAG_SERVER_NAME: 1281 }, { EC_TAG_SERVER_DESC: 1282 }, { EC_TAG_SERVER_ADDRESS: 1283 },
    { EC_TAG_SERVER_PING: 1284 }, { EC_TAG_SERVER_USERS: 1285 }, { EC_TAG_SERVER_USERS_MAX: 1286 },
    { EC_TAG_SERVER_FILES: 1287 }, { EC_TAG_SERVER_PRIO: 1288 }, { EC_TAG_SERVER_FAILED: 1289 },
    { EC_TAG_SERVER_STATIC: 1290 }, { EC_TAG_SERVER_VERSION: 1291 }, { EC_TAG_SERVER_IP: 1292 },
    { EC_TAG_SERVER_PORT: 1293 },
    // Connection state / misc
    { EC_TAG_CONNSTATE: 5 }, { EC_TAG_ED2K_ID: 6 }, { EC_TAG_CLIENT_ID: 10 }
];

/** Wire level logging: visible while developing, silent in production. */
const log = useLogger('amule-ec');

export class AMuleProtocol {
    /** EC transports strings as UTF-8 (aMule writes wxString data as UTF-8). */
    private static readonly utf8Encoder = new TextEncoder();

    private isConnected: boolean = false;
    private offset: number = 0;
    private arrayBuffers: ArrayBuffer[] = [];
    private recurcifInBuildTagArrayBuffer = 0;
    private responseOpcode = 0;
    private salt: string = '';
    private client: net.Socket | null = null;
    private textDecoder: TextDecoder | null = null; // Browser

    private ip: string;
    private port: number;
    private md5Password: string;

    // Request queue to serialize requests and prevent concurrent issues
    private requestQueue: Array<{
        data: ArrayBuffer;
        resolve: (value: ArrayBuffer) => void;
        reject: (reason: Error) => void;
        multiChunk: boolean;  // Whether to wait for full packet or just first response
    }> = [];
    private isProcessingRequest: boolean = false;
    /** In-flight connection attempt shared by concurrent callers. */
    private connecting: Promise<string> | null = null;
    private dataHandler: ((data: Buffer) => void) | null = null;
    private errorHandler: ((err: Error) => void) | null = null;
    /**
     * The request currently waiting for an answer, so losing the socket can fail
     * it right away instead of leaving it to run into its timeout.
     */
    private activeRequest: { reject: (reason: Error) => void; timeout: ReturnType<typeof setTimeout> } | null = null;

    constructor(config: ECConfig) {
        this.ip = config.host;
        this.port = config.port;
        
        // If the password is already a 32-character hex string (MD5 hash), use it directly
        if (/^[a-fA-F0-9]{32}$/.test(config.password)) {
            this.md5Password = config.password.toLowerCase();
        } else {
            this.md5Password = crypto.createHash('md5').update(config.password).digest('hex');
        }
        
    }

    /**
     * True only while the authenticated socket is still usable. A socket the
     * daemon closed in the meantime must not be written to: the request would
     * sit in the queue until its timeout and every caller behind it would wait
     * with it.
     */
    public getIsConnected(): boolean {
        return this.isConnected
            && this.client !== null
            && !this.client.destroyed
            && this.client.writable;
    }

    /**
     * Tears the connection down and fails everything still queued, so the next
     * request opens a fresh socket.
     *
     * Reusing a socket after a timeout or a socket error is what corrupts the
     * UI: a late reply is read as the answer to the *next* request, and the
     * mismatched tags then render as nonsense values.
     */
    private dropConnection(reason: string): void {
        this.isConnected = false;
        this.cleanupListeners();

        if (this.client) {
            this.client.removeAllListeners();
            this.client.destroy();
            this.client = null;
        }

        const active = this.activeRequest;
        this.activeRequest = null;
        if (active) {
            clearTimeout(active.timeout);
            active.reject(new Error(reason));
        }

        this.rejectQueued(reason);
    }

    /**
     * Connects to the aMule daemon via TCP and performs authentication.
     *
     * Concurrent callers share one attempt: this client is a singleton used by
     * the API routes, the MCP tools, the WebSocket push and the rate sampler, and
     * a second connect would tear down the socket the first one is authenticating
     * on, leaving its queued requests unanswered.
     */
    public connect(): Promise<string> {
        this.connecting ??= this.performConnect().finally(() => {
            this.connecting = null;
        });

        return this.connecting;
    }

    private async performConnect(): Promise<string> {
        try {
            log.debug('Connecting to', this.ip, this.port);
            await this.initConnToServer(this.ip, this.port);
            log.debug('Connected, sending auth request 1');
            let data = await this.sendToServerSimple(this.getAuthRequest1());
            log.debug('Got response, reading salt');
            this.readSalt(data);
            log.debug('Salt:', this.salt, '- sending auth request 2');
            data = await this.sendToServerSimple(this.getAuthRequest2());
            log.debug('Got auth response');
            if (this.readSalt(data) === ECOpCodes.EC_OP_AUTH_OK) {
                log.debug('Authentication successful!');
                this.isConnected = true;
                return 'Successfully connected to aMule';
            } else {
                log.debug('Authentication failed, opcode:', this.responseOpcode);
                throw new Error('Authentication failed');
            }
        } catch (err: any) {
            log.debug('Connection failed:', err.message);
            this.isConnected = false;
            if (this.client) {
                this.client.removeAllListeners();
                this.client.destroy();
                this.client = null;
            }
            this.rejectQueued(`Connection failed: ${err.message || err}`);
            throw new Error(`Connection failed: ${err.message || err}`);
        }
    }

    /**
     * Disconnects from the server
     */
    public disconnect(): void {
        // Say goodbye first, then go through the same teardown as an unexpected
        // loss so nothing is left waiting on the socket.
        this.client?.end();
        this.dropConnection('Connection closed');
    }

    // ==========================================
    // Public API Methods
    // ==========================================

    public async getDownloads(): Promise<ECResponse[]> {
        const response = await this.sendToServer(this.getDownloadsRequest());
        if (response.children) {
            response.children.forEach(f => {
                const dateKeys = ['partfile_last_recv', 'partfile_last_seen_comp'];
                dateKeys.forEach(key => {
                    if (f[key]) {
                        f[key + '_f'] = new Date(f[key] * 1000);
                    }
                });

                ['partfile_speed', 'completeness'].forEach(key => {
                    if (f[key] === undefined) {
                        f[key] = 0;
                    }
                });

                // Clean up children property as we flattened it
                delete (f as any).children;
            });
            return response.children;
        }
        return [];
    }

    public async getSharedFiles(): Promise<ECResponse[]> {
        const response = await this.sendToServer(this.getSharedFilesRequest());
        if (response.children) {
            // Filter out files currently being downloaded (.part files)
            const filtered = response.children.filter(f =>
                !f['knownfile_filename']?.endsWith('.part')
            );

            filtered.forEach(f => {
                ['knownfile_req_count_all', 'sharedRatio'].forEach(key => {
                    if (f[key] === undefined) f[key] = 0;
                });
                delete (f as any).children;
            });
            return filtered;
        }
        return [];
    }

    public async getStatistics(): Promise<ECResponse> {
        return this.sendToServer(this.getStatsRequest(ECOpCodes.EC_OP_STAT_REQ));
    }

    public async getDetailUpdate(): Promise<ECResponse> {
        return this.sendToServer(this.getStatsRequest(ECOpCodes.EC_OP_GET_UPDATE));
    }

    /**
     * Connection state: ed2k/kad flags plus the currently connected server.
     * Returns the EC_TAG_CONNSTATE node (value = bitmask, children = server / ids).
     */
    public async getConnState(): Promise<ECResponse | null> {
        const response = await this.sendToServer(this.getConnStateRequest());
        return response.children?.find(c => c.nameEcTag === ECTagNames.EC_TAG_CONNSTATE) ?? null;
    }

    public async getServerList(): Promise<ECResponse[]> {
        const response = await this.sendToServer(this.getServerListRequest());
        return response.children || [];
    }

    /**
     * Starts a search. The daemon answers immediately; results are fetched
     * separately, because a Kad search keeps arriving for a while and its
     * progress value stays 0 until the search ends.
     */
    public async startSearch(query: string, network: number = ECSearchType.EC_SEARCH_KAD): Promise<string> {
        return this.sendCommand(this.getSearchStartRequest(query.trim(), network), 'Failed to start search');
    }

    /** Search progress as reported by EC_TAG_SEARCH_STATUS (0..100). */
    public async getSearchProgress(): Promise<number> {
        const response = await this.sendToServer(this.getSearchProgressRequest());
        const value = response.children?.[0]?.value;
        return typeof value === 'number' ? value : 0;
    }

    /** Stops the running search. */
    public async stopSearch(): Promise<string> {
        this.setHeadersToRequest(ECOpCodes.EC_OP_SEARCH_STOP);
        return this.sendCommand(this.finalizeRequest(0), 'Failed to stop search');
    }

    /** Results collected so far for the running (or last) search. */
    public async fetchSearchResults(): Promise<ECResponse[]> {
        const response = await this.sendToServer(this.getSearchResultRequest());
        return response.children || [];
    }

    /** Upload queue (clients currently uploaded to). */
    public async getUploadQueue(): Promise<ECResponse[]> {
        const response = await this.sendToServer(this.getUploadQueueRequest());
        return response.children || [];
    }

    /** Daemon log as a single string blob (EC_OP_GET_LOG). */
    public async getLog(): Promise<string> {
        const response = await this.sendToServer(this.getLogRequest());
        const tag = response.children?.find(c => c.nameEcTag === ECTagNames.EC_TAG_STRING);
        return typeof tag?.value === 'string' ? tag.value : '';
    }

    /** Connection preferences (contains the bandwidth limits). */
    public async getConnectionPreferences(): Promise<ECResponse | null> {
        return this.getPreferenceGroup(ECPrefsSelect.EC_PREFS_CONNECTIONS, ECTagNames.EC_TAG_PREFS_CONNECTIONS);
    }

    /**
     * Reads one preference group and returns its tag node, whose child tags are
     * flattened onto it with friendly names (e.g. `user_nick`).
     */
    public async getPreferenceGroup(selection: number, groupTag: number): Promise<ECResponse | null> {
        const response = await this.sendToServer(this.getPreferencesRequest(selection));
        return response.children?.find(child => child.nameEcTag === groupTag) ?? null;
    }

    /**
     * Writes preference values. `values` maps an EC tag name to its value; the
     * daemon expects them nested inside their group tag (EC_OP_SET_PREFERENCES).
     */
    public async setPreferences(
        groupTag: number,
        values: Array<{ tag: number; type: number; value: any }>
    ): Promise<string> {
        this.setHeadersToRequest(ECOpCodes.EC_OP_SET_PREFERENCES);
        this.buildTagArrayBuffer(
            groupTag * 2 + 1,
            ECOpCodes.EC_TAGTYPE_CUSTOM,
            null,
            values.map(entry => ({ ecTag: entry.tag * 2, ecOp: entry.type, value: entry.value }))
        );
        return this.sendCommand(this.finalizeRequest(1), 'Failed to save preferences');
    }

    /** Raw statistics tree as reported by aMule (EC_OP_GET_STATSTREE). */
    public async getStatsTree(maxClientVersions = 10): Promise<ECResponse | null> {
        this.setHeadersToRequest(ECCodes.EC_OP_GET_STATSTREE);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_DETAIL_LEVEL * 2, ECOpCodes.EC_TAGTYPE_UINT8, ECDetailLevel.EC_DETAIL_FULL, null);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_STATTREE_CAPPING * 2, ECOpCodes.EC_TAGTYPE_UINT8, maxClientVersions, null);
        const response = await this.sendToServer(this.finalizeRequest(2));
        return response.children?.find(child => child.nameEcTag === ECTagNames.EC_TAG_STATTREE_NODE) ?? null;
    }

    /** Human readable info about the connected server (EC_OP_GET_SERVERINFO). */
    public async getServerInfo(): Promise<string[]> {
        this.setHeadersToRequest(ECCodes.EC_OP_GET_SERVERINFO);
        const response = await this.sendToServer(this.finalizeRequest(0));
        return (response.children || [])
            .map(child => child.value)
            .filter((value): value is string => typeof value === 'string' && value.length > 0);
    }

    /** Reloads the server list from a URL. */
    public async updateServerListFromUrl(url: string): Promise<string> {
        this.setHeadersToRequest(ECCodes.EC_OP_SERVER_UPDATE_FROM_URL);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_STRING * 2, ECOpCodes.EC_OP_STRINGS, url + "\0", null);
        return this.sendCommand(this.finalizeRequest(1), 'Failed to update the server list');
    }

    /** Reloads the Kad nodes.dat from a URL. */
    public async updateKadNodesFromUrl(url: string): Promise<string> {
        this.setHeadersToRequest(ECCodes.EC_OP_KAD_UPDATE_FROM_URL);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_STRING * 2, ECOpCodes.EC_OP_STRINGS, url + "\0", null);
        return this.sendCommand(this.finalizeRequest(1), 'Failed to update Kad nodes');
    }

    /** Bootstraps Kad from a known node. */
    public async bootstrapKadFromIp(ip: string, port: number): Promise<string> {
        const octets = ip.split('.').map(part => Number(part));
        if (octets.length !== 4 || octets.some(octet => !Number.isFinite(octet) || octet < 0 || octet > 255)) {
            throw new Error(`Invalid IPv4 address: '${ip}'`);
        }

        // aMule reads this as a plain uint32 in host order (BootstrapKad(ip, port))
        const packed = ((octets[3]! << 24) | (octets[2]! << 16) | (octets[1]! << 8) | octets[0]!) >>> 0;

        this.setHeadersToRequest(ECCodes.EC_OP_KAD_BOOTSTRAP_FROM_IP);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_BOOTSTRAP_IP * 2, ECOpCodes.EC_TAGTYPE_UINT32, packed, null);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_BOOTSTRAP_PORT * 2, ECOpCodes.EC_TAGTYPE_UINT16, port & 0xffff, null);
        return this.sendCommand(this.finalizeRequest(2), 'Failed to bootstrap Kad');
    }

    /** Connects to one specific server ("ip:port"). */
    public async connectToServer(address: string): Promise<string> {
        this.setHeadersToRequest(ECCodes.EC_OP_SERVER_CONNECT);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_SERVER * 2, ECOpCodes.EC_TAGTYPE_IPV4, address, null);
        return this.sendCommand(this.finalizeRequest(1), 'Failed to connect to server');
    }

    /** Removes a server from the list, identified by "ip:port". */
    public async removeServer(address: string): Promise<string> {
        this.setHeadersToRequest(ECCodes.EC_OP_SERVER_REMOVE);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_SERVER * 2, ECOpCodes.EC_TAGTYPE_IPV4, address, null);
        return this.sendCommand(this.finalizeRequest(1), 'Failed to remove server');
    }

    /** Adds a server given as "ip:port", with an optional display name. */
    public async addServer(address: string, name?: string): Promise<string> {
        this.setHeadersToRequest(ECCodes.EC_OP_SERVER_ADD);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_SERVER_ADDRESS * 2, ECOpCodes.EC_OP_STRINGS, address + "\0", null);
        let tagCount = 1;
        if (name) {
            this.buildTagArrayBuffer(ECTagNames.EC_TAG_SERVER_NAME * 2, ECOpCodes.EC_OP_STRINGS, name + "\0", null);
            tagCount++;
        }
        return this.sendCommand(this.finalizeRequest(tagCount), 'Failed to add server');
    }

    /** Connects the enabled networks (ed2k and/or Kad). */
    public async connectNetwork(network?: 'ed2k' | 'kad'): Promise<string> {
        const opCode = network === 'kad' ? ECOpCodes.EC_OP_KAD_START : ECOpCodes.EC_OP_CONNECT;
        return this.sendSimpleCommand(opCode);
    }

    /** Disconnects the given network, or all of them when omitted. */
    public async disconnectNetwork(network?: 'ed2k' | 'kad'): Promise<string> {
        const opCode = network === 'kad' ? ECOpCodes.EC_OP_KAD_STOP : ECOpCodes.EC_OP_DISCONNECT;
        return this.sendSimpleCommand(opCode);
    }

    /**
     * Sends a request with no tags and returns the daemon's message.
     */
    private async sendSimpleCommand(opCode: number): Promise<string> {
        this.setHeadersToRequest(opCode);
        return this.sendCommand(this.finalizeRequest(0), 'Command failed');
    }

    /**
     * Sends a command packet and inspects the reply.
     *
     * The daemon answers commands with EC_OP_NOOP on success, EC_OP_STRINGS with
     * human readable text, or EC_OP_FAILED plus a reason. Ignoring the reply (as
     * this client used to) makes every command look successful, so a rejected
     * ed2k link was reported as added.
     */
    private async sendCommand(data: ArrayBuffer, failureMessage: string): Promise<string> {
        const response = await this.sendToServer(data);
        const messages = (response.children || [])
            .map(child => child.value)
            .filter((value): value is string => typeof value === 'string' && value.length > 0);

        if (response.opCode === ECOpCodes.EC_OP_FAILED) {
            throw new Error(messages.join(' ') || failureMessage);
        }
        return messages.join(' ');
    }

    public async download(hash: string): Promise<string> {
        return this.sendCommand(this.downloadRequest(hash), 'Failed to start download');
    }

    public async addLink(link: string): Promise<string> {
        return this.sendCommand(this.addLinkRequest(link), 'Invalid link or already on list');
    }

    public async cancelDownload(hash: string): Promise<string> {
        return this.sendCommand(this.getCancelDownloadRequest(hash), 'Failed to cancel download');
    }

    public async pauseDownload(hash: string): Promise<string> {
        return this.sendCommand(this.getPauseDownloadRequest(hash), 'Failed to pause download');
    }

    public async resumeDownload(hash: string): Promise<string> {
        return this.sendCommand(this.getResumeDownloadRequest(hash), 'Failed to resume download');
    }

    public async setPriority(hash: string, priority: number): Promise<string> {
        return this.sendCommand(this.getSetPriorityRequest(hash, priority), 'Failed to set priority');
    }

    public async setMaxDownload(limit: number): Promise<string> {
        return this.sendCommand(
            this.getSetMaxBandwidthRequest(ECTagNames.EC_TAG_CONN_MAX_DL, limit),
            'Failed to set download limit'
        );
    }

    public async setMaxUpload(limit: number): Promise<string> {
        return this.sendCommand(
            this.getSetMaxBandwidthRequest(ECTagNames.EC_TAG_CONN_MAX_UL, limit),
            'Failed to set upload limit'
        );
    }

    // ==========================================
    // Private Network & Protocol Methods
    // ==========================================

    /**
     * Fails every queued request instead of dropping it.
     *
     * Silently clearing the queue leaves those promises pending forever, which
     * makes the caller (an API request, an MCP tool) hang until its own timeout.
     */
    private rejectQueued(reason: string): void {
        const pending = this.requestQueue;
        this.requestQueue = [];
        this.isProcessingRequest = false;

        for (const request of pending) {
            request.reject(new Error(reason));
        }
    }

    private initConnToServer(ip: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            // Clean up any existing stale socket first
            if (this.client) {
                this.client.removeAllListeners();
                this.client.destroy();
                this.client = null;
            }
            this.rejectQueued('Connection was reset before the request completed');

            const socket = new net.Socket();
            this.client = socket;

            // Set a connection timeout
            socket.setTimeout(CONNECT_TIMEOUT_MS);

            socket.once('timeout', () => {
                socket.destroy();
                reject(new Error('Connection timeout'));
            });

            // Permanent listeners: a socket the daemon resets while idle emits
            // 'error' with no request in flight, and an 'error' without a
            // listener takes the whole Nitro process down. They also mark the
            // client disconnected, so the next call reconnects by itself.
            socket.on('error', (err: Error) => {
                if (this.client === socket) {
                    this.isConnected = false;
                }
                log.debug('Socket error', err.message);
            });

            socket.on('close', () => {
                if (this.client === socket) {
                    this.dropConnection('The aMule daemon closed the connection');
                }
            });

            socket.connect(port, ip);
            socket.once('connect', () => {
                socket.setTimeout(0); // Disable timeout after connect
                resolve();
            });
            socket.once('error', (err) => reject(err));
        });
    }

    private toBuffer(ab: ArrayBuffer): Buffer {
        return Buffer.from(new Uint8Array(ab));
    }

    private toArrayBuffer(buf: Buffer): ArrayBuffer {
        // Buffer.buffer can be ArrayBuffer or SharedArrayBuffer; cast to ArrayBuffer to satisfy TypeScript.
        return (buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    }

    private sendToServerSimple(data: ArrayBuffer): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            if (!this.client) return reject(new Error('Not connected'));

            // Queue the request (simple = single response packet)
            this.requestQueue.push({ data, resolve, reject, multiChunk: false });
            this.processNextRequest();
        });
    }

    /*
     * The packet-level chatter below is `trace`, not `debug`.
     *
     * Every request logs eight lines, and the app polls the daemon continuously:
     * a couple of hours of `LOG_LEVEL=debug` (which is the default while
     * developing) produced 4,800 requests and a multi-megabyte log of nothing
     * but this. It is exactly what you want when reading the wire, and exactly
     * what you do not want the rest of the time - so `debug` keeps the
     * connection, authentication and failure lines, and `trace` has the packets.
     */
    private processNextRequest(): void {
        if (this.isProcessingRequest || this.requestQueue.length === 0 || !this.client) {
            log.trace('processNextRequest skipped - processing:', this.isProcessingRequest, 'queueLen:', this.requestQueue.length, 'client:', !!this.client);
            return;
        }

        // Writing into a half-closed socket never gets an answer, so fail the
        // queue now instead of letting every entry run into its timeout.
        if (this.client.destroyed || !this.client.writable) {
            this.dropConnection('The connection to the aMule daemon was lost');
            return;
        }

        log.trace('processNextRequest starting');
        this.isProcessingRequest = true;
        const request = this.requestQueue.shift()!;

        // Remove any existing listeners to prevent memory leaks
        this.cleanupListeners();

        let buf: ArrayBuffer[] = [];
        let totalSizeOfRequest = 0;

        const timeoutHandle = setTimeout(() => {
            log.debug('Request timeout!');
            // The socket cannot be reused: a reply arriving later would be read
            // as the answer to the next request and parsed against the wrong
            // tags, which is how the UI ends up showing garbage.
            this.activeRequest = null;
            this.dropConnection('The aMule daemon did not answer in time');
            request.reject(new Error('Request timeout'));
        }, REQUEST_TIMEOUT_MS);

        this.activeRequest = { reject: request.reject, timeout: timeoutHandle };

        this.dataHandler = (data: Buffer) => {
            log.trace('Received data:', data.length, 'bytes');
            if (request.multiChunk) {
                // Multi-chunk: accumulate until we have full packet
                buf.push(this.toArrayBuffer(data));

                if (buf[0] && totalSizeOfRequest === 0 && buf[0].byteLength >= 8) {
                    const headerView = new DataView(buf[0]);
                    const packetLength = headerView.getUint32(4);
                    totalSizeOfRequest = packetLength + 8;
                    log.trace('Expected total size:', totalSizeOfRequest);
                }

                const currentLength = buf.reduce((acc, b) => acc + b.byteLength, 0);
                log.trace('Current length:', currentLength, 'of', totalSizeOfRequest);

                if (totalSizeOfRequest > 0 && currentLength >= totalSizeOfRequest) {
                    log.trace('Multi-chunk complete!');
                    clearTimeout(timeoutHandle);
                    this.cleanupListeners();

                    // Assemble complete buffer
                    const completeBuffer = new Uint8Array(currentLength);
                    let offset = 0;
                    for (const b of buf) {
                        completeBuffer.set(new Uint8Array(b), offset);
                        offset += b.byteLength;
                    }

                    this.isProcessingRequest = false;
                    this.activeRequest = null;
                    request.resolve(completeBuffer.buffer);
                    this.processNextRequest();
                }
            } else {
                // Simple: first response completes the request
                clearTimeout(timeoutHandle);
                this.cleanupListeners();
                this.isProcessingRequest = false;
                this.activeRequest = null;
                request.resolve(this.toArrayBuffer(data));
                this.processNextRequest();
            }
        };

        this.errorHandler = (err: Error) => {
            clearTimeout(timeoutHandle);
            // Same reasoning as the timeout: the stream position is unknown
            // after an error, so the connection is dropped rather than reused.
            this.activeRequest = null;
            this.dropConnection(`Connection error: ${err.message}`);
            request.reject(err);
        };

        this.client.on('data', this.dataHandler);
        this.client.once('error', this.errorHandler);
        
        const sendBuf = this.toBuffer(request.data);
        log.trace('Sending', sendBuf.length, 'bytes, socket readable:', this.client.readable, 'writable:', this.client.writable);
        const writeResult = this.client.write(sendBuf);
        log.trace('Write result:', writeResult);
    }

    private cleanupListeners(): void {
        if (this.client) {
            if (this.dataHandler) {
                this.client.removeListener('data', this.dataHandler);
            }
            if (this.errorHandler) {
                this.client.removeListener('error', this.errorHandler);
            }
        }
        this.dataHandler = null;
        this.errorHandler = null;
    }

    private sendToServer(data: ArrayBuffer): Promise<ECResponse> {
        return new Promise<ArrayBuffer>((resolve, reject) => {
            if (!this.client) return reject(new Error('Not connected'));

            // Queue the request with multi-chunk handling
            this.requestQueue.push({
                data,
                resolve,
                reject,
                multiChunk: true
            });
            this.processNextRequest();
        }).then(data => this.readResultsList(data));
    }

    // ==========================================
    // Packet Construction Methods
    // ==========================================

    private buildTagArrayBuffer(ecTag: number, ecOp: number, value: any, children: { ecTag: number, ecOp: number, value: any }[] | null): number {
        this.recurcifInBuildTagArrayBuffer++;
        let tagLength = 0;

        // Tag Name (2 bytes)
        const dvName = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
        dvName.setUint16(0, ecTag, false);
        this.arrayBuffers.push(dvName.buffer);
        tagLength += Uint16Array.BYTES_PER_ELEMENT;

        // Tag Type (1 byte)
        const dvType = new DataView(new ArrayBuffer(Uint8Array.BYTES_PER_ELEMENT));
        dvType.setUint8(0, ecOp);
        this.arrayBuffers.push(dvType.buffer);
        tagLength += Uint8Array.BYTES_PER_ELEMENT;

        // Length placeholder (4 bytes)
        const lengthDataView = new DataView(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
        this.arrayBuffers.push(lengthDataView.buffer);
        tagLength += Uint32Array.BYTES_PER_ELEMENT;

        let childrenTagsLength = 0;
        // Handle Children
        if ((ecTag & 0x01) !== 0 && children === null) {
            // Tag expects children but has none -> send 0 count
            const dvCount = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
            dvCount.setUint16(0, 0, false);
            this.arrayBuffers.push(dvCount.buffer);
            if (this.recurcifInBuildTagArrayBuffer < 2) {
                tagLength += Uint16Array.BYTES_PER_ELEMENT;
            }
        } else if (children) {
            // Has children -> send count
            const dvCount = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
            this.arrayBuffers.push(dvCount.buffer); // Placeholder for count? No, we set it later?
            // The original code pushed a buffer then set it after loop.
            // Wait, original code:
            // dv = new DataView(new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT));
            // this.arrayBuffers.push(dv.buffer);
            // ... loop ...
            // dv.setUint16(0, children.length, false);
            // So yes, we push buffer and modify it later (via variable reference)

            tagLength += Uint16Array.BYTES_PER_ELEMENT;

            for (const child of children) {
                childrenTagsLength += this.buildTagArrayBuffer(child.ecTag, child.ecOp, child.value, null);
            }
            dvCount.setUint16(0, children.length, false);
        }

        // Set Length
        let calculatedLength = 0;
        if (ecOp === ECOpCodes.EC_TAGTYPE_UINT16) {
            calculatedLength = 2 + childrenTagsLength;
        } else if (ecOp === ECOpCodes.EC_TAGTYPE_IPV4) {
            calculatedLength = 6 + childrenTagsLength; // 4 bytes IP + 2 bytes port
        } else if (ecOp === ECOpCodes.EC_TAGTYPE_UINT32) {
            calculatedLength = 4 + childrenTagsLength;
        } else if (ecOp === ECOpCodes.EC_TAGTYPE_UINT8) {
            calculatedLength = 1 + childrenTagsLength;
        } else if (ecOp === ECOpCodes.EC_TAGTYPE_HASH16) {
            calculatedLength = (value.length / 2) + childrenTagsLength;
        } else if (ecOp === ECOpCodes.EC_OP_STRINGS && typeof value === 'string') {
            // Strings go over EC as UTF-8, so the tag length must count bytes, not
            // JavaScript characters: "días" is 4 characters but 5 bytes. Declaring
            // the character count desynchronises the whole packet and aMule then
            // rejects the request ("Invalid link or already on list").
            calculatedLength = AMuleProtocol.utf8Encoder.encode(value).byteLength + childrenTagsLength;
        } else {
            // Custom (a parent tag carrying only children)
             calculatedLength = (value ? value.length : 0) + childrenTagsLength;
        }
        lengthDataView.setUint32(0, calculatedLength, false);

        // Set Content
        if (ecOp === ECOpCodes.EC_OP_STRINGS && typeof value === 'string') {
            const encoded = AMuleProtocol.utf8Encoder.encode(value);
            for (const byte of encoded) {
                const dv = new DataView(new ArrayBuffer(1));
                dv.setUint8(0, byte);
                this.arrayBuffers.push(dv.buffer);
                tagLength += 1;
            }
        } else if (ecOp === ECOpCodes.EC_TAGTYPE_UINT8) {
            const dv = new DataView(new ArrayBuffer(1));
            dv.setUint8(0, value);
            this.arrayBuffers.push(dv.buffer);
            tagLength += 1;
        } else if (ecOp === ECOpCodes.EC_TAGTYPE_HASH16 && typeof value === 'string') {
             for (let i = 0; i < value.length; i += 2) {
                const dv = new DataView(new ArrayBuffer(1));
                const hashValue = parseInt(value.substring(i, i + 2), 16);
                dv.setUint8(0, hashValue);
                this.arrayBuffers.push(dv.buffer);
                tagLength += 1;
            }
        } else if (ecOp === ECOpCodes.EC_TAGTYPE_UINT16) {
            const dv = new DataView(new ArrayBuffer(2));
            dv.setUint16(0, value, false);
            this.arrayBuffers.push(dv.buffer);
            tagLength += 2;
        } else if (ecOp === ECOpCodes.EC_TAGTYPE_UINT32) {
            const dv = new DataView(new ArrayBuffer(4));
            dv.setUint32(0, value, false);
            this.arrayBuffers.push(dv.buffer);
            tagLength += 4;
        } else if (ecOp === ECOpCodes.EC_TAGTYPE_IPV4 && typeof value === 'string') {
            // aMule's EC_IPv4_t: the four octets in order, then the port in
            // network byte order (see CECTag(ec_tagname_t, const EC_IPv4_t&)).
            const [ip = '', port = '0'] = value.split(':');
            const octets = ip.split('.').map(part => Number(part) & 0xff);
            if (octets.length !== 4 || octets.some(octet => !Number.isFinite(octet))) {
                throw new Error(`Invalid IPv4 address: '${value}'`);
            }

            const dv = new DataView(new ArrayBuffer(6));
            octets.forEach((octet, index) => dv.setUint8(index, octet));
            dv.setUint16(4, Number(port) & 0xffff, false);
            this.arrayBuffers.push(dv.buffer);
            tagLength += 6;
        }

        this.recurcifInBuildTagArrayBuffer--;
        return tagLength;
    }

    private setHeadersToRequest(opCode: number) {
        // Flags (4 bytes) - Normal = 32
        const dvFlags = new DataView(new ArrayBuffer(4));
        dvFlags.setUint32(0, 32, false);
        this.arrayBuffers.push(dvFlags.buffer);

        // Packet body length (4 bytes) - placeholder
        this.arrayBuffers.push(new ArrayBuffer(4));

        // Op Code (1 byte)
        const dvOp = new DataView(new ArrayBuffer(1));
        dvOp.setUint8(0, opCode);
        this.arrayBuffers.push(dvOp.buffer);

        // Tag count (2 bytes) - placeholder
        this.arrayBuffers.push(new ArrayBuffer(2));
    }

    private finalizeRequest(tagCount: number): ArrayBuffer {
        const bufferLength = this.arrayBuffers.reduce((acc, b) => acc + b.byteLength, 0);
        const buffer = new ArrayBuffer(bufferLength);
        const uint8Buffer = new Uint8Array(buffer);

        let offset = 0;
        for (const b of this.arrayBuffers) {
            uint8Buffer.set(new Uint8Array(b), offset);
            offset += b.byteLength;
        }

        this.arrayBuffers = [];

        // Set body length (Total - 8 bytes of header)
        const bodyLengthDataView = new DataView(buffer, 4, 4);
        bodyLengthDataView.setUint32(0, buffer.byteLength - 8, false);

        // Set tag count (Offset: 4 (flags) + 4 (len) + 1 (opcode) = 9)
        const tagNumberDataView = new DataView(buffer, 9, 2);
        tagNumberDataView.setUint16(0, tagCount, false);

        return buffer;
    }

    // ==========================================
    // Request Generators
    // ==========================================

    private getAuthRequest1(): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_AUTH_REQ);
        let tagCount = 0;
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_CLIENT_NAME * 2, ECOpCodes.EC_OP_STRINGS, "amule-nuxt\0", null);
        tagCount++;
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_CLIENT_VERSION * 2, ECOpCodes.EC_OP_STRINGS, "1.0\0", null);
        tagCount++;
        this.buildTagArrayBuffer(4, ECOpCodes.EC_TAGTYPE_UINT16, ECCodes.EC_CURRENT_PROTOCOL_VERSION, null);
        tagCount++;
        return this.finalizeRequest(tagCount);
    }

    private getAuthRequest2(): ArrayBuffer {
        this.setHeadersToRequest(80); // EC_OP_AUTH_PASSWD = 0x50
        let tagCount = 0;
        
        // aMule authentication algorithm:
        // 1. saltHash = MD5(salt_as_uppercase_hex_string)
        // 2. finalHash = MD5(password_md5_lowercase + saltHash)
        // 
        // `this.md5Password` is the MD5 of the plain password as hex string
        // `this.salt` is the salt as uppercase hex string (from readSalt)
        
        // Step 1: Compute MD5 of salt hex string
        const saltHash = crypto.createHash('md5').update(this.salt).digest('hex');
        
        // Step 2: Concatenate password hash (lowercase) + saltHash, then compute MD5
        const combined = this.md5Password.toLowerCase() + saltHash;
        const passwd = crypto.createHash('md5').update(combined).digest('hex');
        
        // Build the HASH16 tag using the hex result
        this.buildTagArrayBuffer(2, ECOpCodes.EC_TAGTYPE_HASH16, passwd, null);
        tagCount++;
        return this.finalizeRequest(tagCount);
    }

    private getDownloadsRequest(): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_GET_DLOAD_QUEUE);
        return this.finalizeRequest(0);
    }

    private getSharedFilesRequest(): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_GET_SHARED_FILES);
        return this.finalizeRequest(0);
    }

    private getStatsRequest(opCode: number): ArrayBuffer {
        this.setHeadersToRequest(opCode);
        const EC_TAG_DETAIL_LEVEL = 4;
        const EC_DETAIL_INC_UPDATE = 4;
        this.buildTagArrayBuffer(EC_TAG_DETAIL_LEVEL * 2, ECOpCodes.EC_TAGTYPE_UINT8, EC_DETAIL_INC_UPDATE, null);
        return this.finalizeRequest(1);
    }

    private getUploadQueueRequest(): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_GET_ULOAD_QUEUE);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_DETAIL_LEVEL * 2, ECOpCodes.EC_TAGTYPE_UINT8, ECDetailLevel.EC_DETAIL_FULL, null);
        return this.finalizeRequest(1);
    }

    private getLogRequest(): ArrayBuffer {
        this.setHeadersToRequest(ECOpCodes.EC_OP_GET_LOG);
        return this.finalizeRequest(0);
    }

    private getPreferencesRequest(selection: number): ArrayBuffer {
        this.setHeadersToRequest(ECOpCodes.EC_OP_GET_PREFERENCES);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_SELECT_PREFS * 2, ECOpCodes.EC_TAGTYPE_UINT32, selection, null);
        return this.finalizeRequest(1);
    }

    private getConnStateRequest(): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_GET_CONNSTATE);
        // EC_DETAIL_CMD makes the daemon include the connected server's name
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_DETAIL_LEVEL * 2, ECOpCodes.EC_TAGTYPE_UINT8, ECDetailLevel.EC_DETAIL_CMD, null);
        return this.finalizeRequest(1);
    }

    private getServerListRequest(): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_GET_SERVER_LIST);
        return this.finalizeRequest(0);
    }

    private getSearchStartRequest(q: string, searchType: number): ArrayBuffer {
        this.setHeadersToRequest(ECOpCodes.EC_OP_SEARCH_START);

        const children = [{
            ecTag: 1794 * 2, // EC_TAG_SEARCH_NAME
            ecOp: ECOpCodes.EC_OP_STRINGS,
            value: q + "\0"
        }, {
            ecTag: ECTagSearchFile.EC_TAG_SEARCH_FILE_TYPE,
            ecOp: ECOpCodes.EC_OP_STRINGS,
            value: "\0"
        }, {
            ecTag: ECTagSearchFile.EC_TAG_SEARCH_EXTENSION,
            ecOp: ECOpCodes.EC_OP_STRINGS,
            value: "\0" // Any extension
        }];

        this.buildTagArrayBuffer(ECTagSearchFile.EC_TAG_SEARCH_TYPE, ECOpCodes.EC_TAGTYPE_UINT8, searchType, children);
        return this.finalizeRequest(1);
    }

    private getSearchProgressRequest(): ArrayBuffer {
        this.setHeadersToRequest(ECOpCodes.EC_OP_SEARCH_PROGRESS);
        return this.finalizeRequest(0);
    }

    private getSearchResultRequest(): ArrayBuffer {
        this.setHeadersToRequest(ECOpCodes.EC_OP_SEARCH_RESULTS);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_DETAIL_LEVEL * 2, ECOpCodes.EC_TAGTYPE_UINT8, ECDetailLevel.EC_DETAIL_FULL, null);
        return this.finalizeRequest(1);
    }

    private downloadRequest(hash: string): ArrayBuffer {
        this.setHeadersToRequest(ECOpCodes.EC_OP_DOWNLOAD_SEARCH_RESULT);
        const children = [{
            ecTag: ECTagNames.EC_TAG_PARTFILE_CAT * 2,
            ecOp: ECOpCodes.EC_TAGTYPE_UINT8,
            value: 0
        }];
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_PARTFILE * 2 + 1, ECOpCodes.EC_TAGTYPE_HASH16, hash, children);
        return this.finalizeRequest(1);
    }

    private addLinkRequest(link: string): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_ADD_LINK);
        // EC_TAG_STRING (0x0000) carries the ed2k/magnet link
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_STRING * 2, ECOpCodes.EC_OP_STRINGS, link + "\0", null);
        return this.finalizeRequest(1);
    }

    private getCancelDownloadRequest(hash: string): ArrayBuffer {
        this.setHeadersToRequest(ECOpCodes.EC_OP_PARTFILE_DELETE);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_PARTFILE * 2, ECOpCodes.EC_TAGTYPE_HASH16, hash, null);
        return this.finalizeRequest(1);
    }

    private getPauseDownloadRequest(hash: string): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_PARTFILE_PAUSE);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_PARTFILE * 2, ECOpCodes.EC_TAGTYPE_HASH16, hash, null);
        return this.finalizeRequest(1);
    }

    private getResumeDownloadRequest(hash: string): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_PARTFILE_RESUME);
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_PARTFILE * 2, ECOpCodes.EC_TAGTYPE_HASH16, hash, null);
        return this.finalizeRequest(1);
    }

    private getSetPriorityRequest(hash: string, priority: number): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_PARTFILE_PRIO_SET);
        const children = [{
            ecTag: ECTagNames.EC_TAG_PARTFILE_PRIO * 2,
            ecOp: ECOpCodes.EC_TAGTYPE_UINT8,
            value: priority
        }];
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_PARTFILE * 2 + 1, ECOpCodes.EC_TAGTYPE_HASH16, hash, children);
        return this.finalizeRequest(1);
    }

    private getSetMaxBandwidthRequest(tag: number, limit: number): ArrayBuffer {
        this.setHeadersToRequest(ECOpCodes.EC_OP_SET_PREFERENCES);
        const children = [{
            ecTag: tag * 2,
            ecOp: ECOpCodes.EC_TAGTYPE_UINT32,
            value: limit
        }];
        this.buildTagArrayBuffer(ECTagNames.EC_TAG_PREFS_CONNECTIONS * 2 + 1, ECOpCodes.EC_TAGTYPE_CUSTOM, null, children);
        return this.finalizeRequest(1);
    }


    // ==========================================
    // Packet Parsing Methods
    // ==========================================

    private readBuffer(buffer: ArrayBuffer, byteNumberToRead: number, littleEndian: boolean = false): number {
        const dataView = new DataView(buffer, this.offset, byteNumberToRead);
        let val = 0;
        if (byteNumberToRead === 1) {
            val = dataView.getUint8(0);
        } else if (byteNumberToRead === 2) {
            val = dataView.getUint16(0, littleEndian);
        } else if (byteNumberToRead === 4) {
            val = dataView.getUint32(0, littleEndian);
        }
        this.offset += byteNumberToRead;
        return val;
    }

    private readSalt(buffer: ArrayBuffer): number {
        // Header is 8 bytes (flags 4 + length 4)
        // Then: Opcode (1) + TagCount (2) + tagName (2) + type (1) + length (4) = 10 bytes
        // Salt value starts at offset 18

        const dataView = new DataView(buffer, 8); // Start after header

        // Opcode (1 byte)
        this.responseOpcode = dataView.getUint8(0);

        // If Opcode is 79 (0x4F) -> EC_OP_AUTH_SALT
        if (this.responseOpcode === 79) {
            // Salt is a uint64 (8 bytes) starting at position 10 in dataView (buffer offset 18)
            // Read as two uint32 values (big-endian) and combine into a BigInt
            const saltHigh = dataView.getUint32(10, false);
            const saltLow = dataView.getUint32(14, false);
            const saltValue = BigInt(saltHigh) * BigInt(0x100000000) + BigInt(saltLow);
            
            // Convert to uppercase hex string (like aMule's CFormat(wxT("%lX")) % salt)
            this.salt = saltValue.toString(16).toUpperCase();
        }
        return this.responseOpcode;
    }

    private readHeader(buffer: ArrayBuffer): ECResponse {
        this.offset = 0;
        const response: Partial<ECResponse> = {};

        response.header = this.readBuffer(buffer, 4); // Flags
        const responseLength = this.readBuffer(buffer, 4); // Length
        response.totalSizeOfRequest = responseLength + 8;
        response.length = responseLength - 3; // Length of children (Total - 1 opcode - 2 tagCount)

        response.opCode = this.readBuffer(buffer, 1);
        response.tagCountInResponse = this.readBuffer(buffer, 2);

        return response as ECResponse;
    }

    private readValueOfANode(node: ECResponse, buffer: ArrayBuffer): any {
        if (!node.length) return '';

        if (node.typeEcOp === ECOpCodes.EC_TAGTYPE_UINT8 ||
            node.typeEcOp === ECOpCodes.EC_TAGTYPE_UINT16 ||
            node.typeEcOp === 4) { // 4 is uint32?
            return this.readBuffer(buffer, node.length);
        } else if (node.typeEcOp === 5) { // uint64
            const high = this.readBuffer(buffer, 4);
            const low = this.readBuffer(buffer, 4);
            let n = high * 4294967296.0 + low;
            if (low < 0) n += 4294967296;
            return n;
        } else if (node.typeEcOp === ECOpCodes.EC_OP_STRINGS) {
            const bytes: number[] = [];
            for (let m = 0; m < node.length; m++) {
                bytes.push(this.readBuffer(buffer, 1));
            }

            // Each tag carries a complete UTF-8 string, so decode it on its own.
            // A shared streaming decoder would carry an incomplete sequence over
            // into the next tag and corrupt it.
            let str = Buffer.from(bytes).toString('utf8');

            // Remove null terminator if present
            if (str.endsWith('\0')) {
                str = str.substring(0, str.length - 1);
            }
            return str;
        } else if (node.typeEcOp === ECOpCodes.EC_TAGTYPE_DOUBLE) {
            // aMule stores doubles as their printed form (CECTag(name, double)),
            // so read the bytes as text and parse them back.
            const bytes: number[] = [];
            for (let m = 0; m < node.length; m++) {
                bytes.push(this.readBuffer(buffer, 1));
            }

            const text = Buffer.from(bytes).toString('utf8').replace(/\0+$/, '');
            const parsed = Number.parseFloat(text);
            return Number.isFinite(parsed) ? parsed : 0;
        } else if (node.typeEcOp === ECOpCodes.EC_TAGTYPE_IPV4) {
            // 4 bytes IPv4 + 2 bytes port (aMule EC_IPv4_t)
            const a = this.readBuffer(buffer, 1);
            const b = this.readBuffer(buffer, 1);
            const c = this.readBuffer(buffer, 1);
            const d = this.readBuffer(buffer, 1);
            // Port is stored in network byte order (ENDIAN_HTONS in aMule's CECTag)
            const port = node.length >= 6 ? this.readBuffer(buffer, 2) : 0;
            return `${a}.${b}.${c}.${d}:${port}`;
        } else if (node.typeEcOp === ECOpCodes.EC_TAGTYPE_HASH16) {
            let hash = '';
            for (let m = 0; m < node.length; m += 2) {
                let c = this.readBuffer(buffer, 2).toString(16);
                c = ('0000' + c).slice(-4);
                hash += c;
            }
            return hash;
        } else if (node.typeEcOp === ECOpCodes.EC_TAGTYPE_UINT128) {
            let hex = '';
            for (let m = 0; m < node.length; m++) {
                hex += this.readBuffer(buffer, 1).toString(16).padStart(2, '0');
            }
            return hex;
        } else {
            // Unknown type, just consume buffer
            let val = '';
            for (let m = 0; m < node.length; m++) {
                 val += this.readBuffer(buffer, 1);
            }
            return val;
        }
    }

    private readBufferChildren(buffer: ArrayBuffer, res: ECResponse, recursivity: number = 1): void {
        res.children = [];

        for (let j = 0; j < res.tagCountInResponse; j++) {
            const child: Partial<ECResponse> = {};
            child.nameEcTag = this.readBuffer(buffer, 2);
            child.typeEcOp = this.readBuffer(buffer, 1);
            child.length = this.readBuffer(buffer, 4);
            child.tagCountInResponse = 0;
            child.value = '';

            res.length -= (7 + child.length!);

            if (child.nameEcTag! % 2) {
                // Has children
                child.nameEcTag = (child.nameEcTag! - 1) / 2;
                child.tagCountInResponse = this.readBuffer(buffer, 2);
                res.length -= 2;
            } else {
                child.nameEcTag = child.nameEcTag! / 2;
            }

            this.readBufferChildren(buffer, child as ECResponse, recursivity + 1);
            res.children.push(child as ECResponse);
        }

        if (recursivity > 1) {
            res.value = this.readValueOfANode(res, buffer);
        }
    }

    private formatResultsList(response: ECResponse): void {
        if (!response.children) return;

        response.children.forEach(e => {
            // Find mapping for this tag
            ECTagMapping.forEach(ref => {
                Object.keys(ref).forEach(key => {
                    if (e.nameEcTag === ref[key]) {
                        // Flatten value to parent using friendly name
                        const propName = (key.split('EC_TAG_')[1] ?? key).toLowerCase();
                        response[propName] = e.value;

                        // Recursively format if it has children
                        if (e.children && e.children.length > 0) {
                            this.formatResultsList(e);
                        }
                    }
                });
            });

             if (e.children && !e.children.length) {
                // Leaf node
             } else {
                 this.formatResultsList(e);
             }
        });

        // Add label to response itself
        ECTagMapping.forEach(ref => {
            Object.keys(ref).forEach(key => {
                 if (response.nameEcTag === ref[key]) {
                     response['label'] = (key.split('EC_TAG_')[1] ?? key).toLowerCase();
                 }
            });
        });

        // Computed properties
        if (response['knownfile_xferred_all'] && response['partfile_size_full']) {
            response['sharedRatio'] = response['knownfile_xferred_all'] / response['partfile_size_full'];
        }
        if (response['partfile_size_done'] && response['partfile_size_full']) {
            response['completeness'] = Math.floor(response['partfile_size_done'] * 10000 / response['partfile_size_full']) / 100;
        }
    }

    private readResultsList(buffer: ArrayBuffer): ECResponse {
        const response = this.readHeader(buffer);

        switch (response.opCode) {
            case ECOpCodes.EC_OP_NOOP: response.opCodeLabel = 'EC_OP_NOOP'; break;
            case ECOpCodes.EC_OP_FAILED: response.opCodeLabel = 'EC_OP_FAILED'; break;
            case ECOpCodes.EC_OP_DLOAD_QUEUE: response.opCodeLabel = 'EC_OP_DLOAD_QUEUE'; break;
            case ECOpCodes.EC_OP_SEARCH_RESULTS: response.opCodeLabel = 'EC_OP_SEARCH_RESULTS'; break;
            default: break;
        }

        this.readBufferChildren(buffer, response);
        this.formatResultsList(response);
        return response;
    }
}
