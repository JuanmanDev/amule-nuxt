import * as net from 'net';
import md5 from 'blueimp-md5';
import { StringDecoder } from 'string_decoder';

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

// Constants
export const ECCodes = {
    EC_CURRENT_PROTOCOL_VERSION: 0x0204,
    EC_OP_AUTH_REQ: 0x02,
    EC_OP_GET_SHARED_FILES: 0x10,
    EC_OP_GET_SERVER_LIST: 0x14,
    EC_OP_ADD_LINK: 0x19,
    EC_OP_PARTFILE_PAUSE: 0x1B,
    EC_OP_PARTFILE_RESUME: 0x1C,
    EC_OP_PARTFILE_PRIO_SET: 0x20
} as const;

export const ECOpCodes = {
    EC_OP_STRINGS: 0x06,
    EC_TAGTYPE_UINT16: 0x03,
    EC_TAGTYPE_CUSTOM: 1,
    EC_TAGTYPE_UINT8: 2,
    EC_TAGTYPE_HASH16: 0x09,
    EC_OP_AUTH_FAIL: 0x03,
    EC_OP_AUTH_OK: 0x04,
    EC_OP_SEARCH_START: 0x26,
    EC_OP_SEARCH_STOP: 0x27,
    EC_OP_SEARCH_RESULTS: 0x28,
    EC_OP_SEARCH_PROGRESS: 0x29,
    EC_OP_DOWNLOAD_SEARCH_RESULT: 0x2A,
    EC_OP_FAILED: 0x05,
    EC_OP_NOOP: 0x01,
    EC_OP_DLOAD_QUEUE: 0x1F, // 31
    EC_OP_STAT_REQ: 0x0A, // 10
    EC_OP_GET_UPDATE: 0x52, // 82
    EC_OP_GET_PREFERENCES: 0x3F, // 63
    EC_OP_SET_PREFERENCES: 0x40, // 64
    EC_OP_PARTFILE_DELETE: 0x1D, // 29
    EC_OP_SHAREDFILES_RELOAD: 0x23, // 35
    EC_OP_CLEAR_COMPLETED: 0x53 // 83
} as const;

export const ECTagNames = {
    EC_TAG_CLIENT_NAME: 0x0100,
    EC_TAG_CLIENT_VERSION: 0x0101,
    EC_TAG_PROTOCOL_VERSION: 0x0002,
    EC_TAG_PASSWD_HASH: 0x0001
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
    { EC_TAG_KNOWNFILE_FILENAME: 1032 }, { EC_TAG_KNOWNFILE_XFERRED_ALL: 1026 }, { EC_TAG_KNOWNFILE_REQ_COUNT_ALL: 1028 },
    { EC_TAG_PREFS_GENERAL: 4608 }, { EC_TAG_USER_NICK: 4609 }, { EC_TAG_USER_HASH: 4610 },
    { EC_TAG_PREFS_CONNECTIONS: 4864 }, { EC_TAG_CONN_MAX_UL: 4868 }, { EC_TAG_CONN_MAX_DL: 4867 }, { EC_TAG_CLIENT: 1536 }, { EC_TAG_CLIENT_NAME: 256 },
    { EC_TAG_CLIENT_HASH: 1539 }, { EC_TAG_CLIENT_USER_ID: 1566 }, { EC_TAG_CLIENT_SOFTWARE: 1537 }, { EC_TAG_CLIENT_SOFT_VER_STR: 1557 },
    { EC_TAG_CLIENT_USER_IP: 1552 }, { EC_TAG_CLIENT_USER_PORT: 1553 }, { EC_TAG_CLIENT_DISABLE_VIEW_SHARED: 1563 }, { EC_TAG_CLIENT_OS_INFO: 1577 },
    { EC_TAG_SERVER: 1280 }, { EC_TAG_STATS_LOGGER_MESSAGE: 525 }, { EC_TAG_STATS_TOTAL_SENT_BYTES: 536 }, { EC_TAG_STATS_TOTAL_RECEIVED_BYTES: 537 },
    { EC_TAG_STATS_UL_SPEED: 512 }, { EC_TAG_STATS_DL_SPEED: 513 }, { EC_TAG_STATS_UL_SPEED_LIMIT: 514 }, { EC_TAG_STATS_DL_SPEED_LIMIT: 515 },
    { EC_TAG_PREFS_DIRECTORIES: 6656 }, { EC_TAG_DIRECTORIES_INCOMING: 6657 }, { EC_TAG_DIRECTORIES_TEMP: 6658 },
    { EC_TAG_PARTFILE_PRIO: 779 }
];

export class AMuleProtocol {
    private isConnected: boolean = false;
    private offset: number = 0;
    private arrayBuffers: ArrayBuffer[] = [];
    private recurcifInBuildTagArrayBuffer = 0;
    private responseOpcode = 0;
    private salt: string = '';
    private client: net.Socket | null = null;
    private textDecoder: TextDecoder | null = null; // Browser
    private stringDecoder: StringDecoder | null = null; // Node

    private ip: string;
    private port: number;
    private md5Password: string;

    constructor(config: ECConfig) {
        this.ip = config.host;
        this.port = config.port;
        this.md5Password = md5(config.password);
        this.stringDecoder = new StringDecoder('utf8');
    }

    public getIsConnected(): boolean {
        return this.isConnected;
    }

    /**
     * Connects to the aMule daemon via TCP and performs authentication
     */
    public async connect(): Promise<string> {
        try {
            await this.initConnToServer(this.ip, this.port);
            let data = await this.sendToServerSimple(this.getAuthRequest1());
            this.readSalt(data);
            data = await this.sendToServerSimple(this.getAuthRequest2());
            if (this.readSalt(data) === ECOpCodes.EC_OP_AUTH_OK) {
                this.isConnected = true;
                return 'Successfully connected to aMule';
            } else {
                throw new Error('Authentication failed');
            }
        } catch (err: any) {
            this.isConnected = false;
            if (this.client) {
                this.client.destroy();
                this.client = null;
            }
            throw new Error(`Connection failed: ${err.message || err}`);
        }
    }

    /**
     * Disconnects from the server
     */
    public disconnect(): void {
        if (this.client) {
            this.client.end();
            this.client.destroy();
            this.client = null;
        }
        this.isConnected = false;
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

    public async getServerList(): Promise<ECResponse[]> {
        const response = await this.sendToServer(this.getServerListRequest());
        return response.children || [];
    }

    public async search(query: string, network: number = ECSearchType.EC_SEARCH_KAD): Promise<ECResponse[]> {
        query = query.trim();
        await this.sendToServer(this.getSearchStartRequest(query, network));

        return new Promise<ECResponse[]>((resolve, reject) => {
            if (network === ECSearchType.EC_SEARCH_KAD) {
                // For Kad, we poll for progress
                let timeout = 120; // 120 attempts
                let count = 0;
                const intervalId = setInterval(async () => {
                    try {
                        const res = await this.sendToServer(this.getSearchProgressRequest());
                        // If search finished (value != 0)
                        if (res.children && res.children[0] && res.children[0].value !== 0) {
                            clearInterval(intervalId);
                            const list = await this.fetchSearchResults();
                            resolve(list.children || []);
                        }
                    } catch (e) {
                        clearInterval(intervalId);
                        reject(e);
                    }

                    if (count++ > timeout) {
                        clearInterval(intervalId);
                        // Return whatever we have or reject?
                        // Let's fetch what we have
                        try {
                            const list = await this.fetchSearchResults();
                            resolve(list.children || []);
                        } catch (e) {
                            reject(new Error('Search timeout'));
                        }
                    }
                }, 1000);
            } else {
                // Local search is faster, wait a bit then fetch
                setTimeout(async () => {
                    try {
                        const list = await this.fetchSearchResults();
                        resolve(list.children || []);
                    } catch (e) {
                        reject(e);
                    }
                }, 1500);
            }
        });
    }

    public async fetchSearchResults(): Promise<ECResponse> {
        return this.sendToServer(this.getSearchResultRequest());
    }

    public async download(hash: string): Promise<void> {
        await this.sendToServerSimple(this.downloadRequest(hash));
    }

    public async addLink(link: string): Promise<void> {
        await this.sendToServerSimple(this.addLinkRequest(link));
    }

    public async cancelDownload(hash: string): Promise<void> {
        await this.sendToServerSimple(this.getCancelDownloadRequest(hash));
    }

    public async pauseDownload(hash: string): Promise<void> {
        await this.sendToServerSimple(this.getPauseDownloadRequest(hash));
    }

    public async resumeDownload(hash: string): Promise<void> {
        await this.sendToServerSimple(this.getResumeDownloadRequest(hash));
    }

    public async setPriority(hash: string, priority: number): Promise<void> {
        await this.sendToServerSimple(this.getSetPriorityRequest(hash, priority));
    }

    public async setMaxDownload(limit: number): Promise<void> {
        await this.sendToServerSimple(this.getSetMaxBandwidthRequest(4867, limit));
    }

    public async setMaxUpload(limit: number): Promise<void> {
        await this.sendToServerSimple(this.getSetMaxBandwidthRequest(4868, limit));
    }

    // ==========================================
    // Private Network & Protocol Methods
    // ==========================================

    private initConnToServer(ip: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client = new net.Socket();
            this.client.connect(port, ip);
            this.client.once('connect', () => resolve());
            this.client.once('error', (err) => reject(err));
        });
    }

    private toBuffer(ab: ArrayBuffer): Buffer {
        return Buffer.from(new Uint8Array(ab));
    }

    private toArrayBuffer(buf: Buffer): ArrayBuffer {
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }

    private sendToServerSimple(data: ArrayBuffer): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            if (!this.client) return reject(new Error('Not connected'));

            this.client.write(this.toBuffer(data));
            this.client.once('data', (data) => resolve(this.toArrayBuffer(data)));
            this.client.once('error', (err) => reject(err));
        });
    }

    private sendToServer(data: ArrayBuffer): Promise<ECResponse> {
        return new Promise<ArrayBuffer>((resolve, reject) => {
            if (!this.client) return reject(new Error('Not connected'));

            let buf: ArrayBuffer[] = [];
            let totalSizeOfRequest = 0;
            const timeout = 10000; // 10s timeout
            const startTime = Date.now();

            const onData = (data: Buffer) => {
                buf.push(this.toArrayBuffer(data));

                // Check if we have enough data for header
                if (buf[0]) {
                    // We need to handle potential fragmentation or multiple chunks
                    // Simple reassembly logic:
                    if (totalSizeOfRequest === 0) {
                         // Read header from first chunk to get total size
                         // Note: _readHeader uses this.offset, so we need to be careful not to mutate global state yet
                         // But _readHeader reads from a single buffer.
                         // We might need to concatenate buf if the first chunk is too small for header (unlikely but possible)
                         if (buf[0].byteLength >= 8) {
                             const headerView = new DataView(buf[0]);
                             const packetLength = headerView.getUint32(4); // offset 4 is length
                             totalSizeOfRequest = packetLength + 8; // +8 for header size (4 flags + 4 length)
                         }
                    }

                    const currentLength = buf.reduce((acc, b) => acc + b.byteLength, 0);

                    if (totalSizeOfRequest > 0 && currentLength >= totalSizeOfRequest) {
                        // Assemble complete buffer
                        const completeBuffer = new Uint8Array(currentLength);
                        let offset = 0;
                        for (const b of buf) {
                            completeBuffer.set(new Uint8Array(b), offset);
                            offset += b.byteLength;
                        }

                        cleanup();
                        resolve(completeBuffer.buffer);
                    }
                }

                if (Date.now() - startTime > timeout) {
                    cleanup();
                    reject(new Error('Request timeout'));
                }
            };

            const onError = (err: Error) => {
                cleanup();
                reject(err);
            };

            const cleanup = () => {
                if (this.client) {
                    this.client.removeListener('data', onData);
                    this.client.removeListener('error', onError);
                }
            };

            this.client.on('data', onData);
            this.client.once('error', onError);
            this.client.write(this.toBuffer(data));

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
        } else if (ecOp === ECOpCodes.EC_TAGTYPE_UINT8) {
            calculatedLength = 1 + childrenTagsLength;
        } else if (ecOp === ECOpCodes.EC_TAGTYPE_HASH16) {
            calculatedLength = (value.length / 2) + childrenTagsLength;
        } else {
            // String or Custom
             calculatedLength = (value ? value.length : 0) + childrenTagsLength;
        }
        lengthDataView.setUint32(0, calculatedLength, false);

        // Set Content
        if (ecOp === ECOpCodes.EC_OP_STRINGS && typeof value === 'string') {
            for (let i = 0; i < value.length; i++) {
                const dv = new DataView(new ArrayBuffer(1));
                dv.setUint8(0, value.charCodeAt(i));
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
        this.setHeadersToRequest(80); // EC_OP_AUTH_RES? No, it's 80 in original code
        let tagCount = 0;
        const passwd = md5(this.md5Password + md5(this.salt));
        this.buildTagArrayBuffer(2, ECOpCodes.EC_TAGTYPE_HASH16, passwd, null);
        tagCount++;
        return this.finalizeRequest(tagCount);
    }

    private getDownloadsRequest(): ArrayBuffer {
        this.setHeadersToRequest(ECOpCodes.EC_OP_DLOAD_QUEUE);
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
        this.buildTagArrayBuffer(8, ECOpCodes.EC_TAGTYPE_UINT8, ECSearchType.EC_SEARCH_LOCAL, null); // 8 is EC_TAG_SEARCH_TYPE?
        return this.finalizeRequest(1);
    }

    private downloadRequest(hash: string): ArrayBuffer {
        this.setHeadersToRequest(ECOpCodes.EC_OP_DOWNLOAD_SEARCH_RESULT);
        const children = [{
            ecTag: 783 * 2, // EC_TAG_PARTFILE_CAT
            ecOp: ECOpCodes.EC_TAGTYPE_UINT8,
            value: 0
        }];
        this.buildTagArrayBuffer(768 * 2 + 1, ECOpCodes.EC_TAGTYPE_HASH16, hash, children);
        return this.finalizeRequest(1);
    }

    private addLinkRequest(link: string): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_ADD_LINK);
        this.buildTagArrayBuffer(ECOpCodes.EC_OP_STRINGS, ECOpCodes.EC_OP_STRINGS, link + "\0", null);
        return this.finalizeRequest(1);
    }

    private getCancelDownloadRequest(hash: string): ArrayBuffer {
        this.setHeadersToRequest(ECOpCodes.EC_OP_PARTFILE_DELETE);
        this.buildTagArrayBuffer(768 * 2, ECOpCodes.EC_TAGTYPE_HASH16, hash, null);
        return this.finalizeRequest(1);
    }

    private getPauseDownloadRequest(hash: string): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_PARTFILE_PAUSE);
        this.buildTagArrayBuffer(768 * 2, ECOpCodes.EC_TAGTYPE_HASH16, hash, null);
        return this.finalizeRequest(1);
    }

    private getResumeDownloadRequest(hash: string): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_PARTFILE_RESUME);
        this.buildTagArrayBuffer(768 * 2, ECOpCodes.EC_TAGTYPE_HASH16, hash, null);
        return this.finalizeRequest(1);
    }

    private getSetPriorityRequest(hash: string, priority: number): ArrayBuffer {
        this.setHeadersToRequest(ECCodes.EC_OP_PARTFILE_PRIO_SET);
        const children = [{
            ecTag: 779 * 2, // EC_TAG_PARTFILE_PRIO
            ecOp: ECOpCodes.EC_TAGTYPE_UINT8,
            value: priority
        }];
        this.buildTagArrayBuffer(768 * 2 + 1, ECOpCodes.EC_TAGTYPE_HASH16, hash, children);
        return this.finalizeRequest(1);
    }

    private getSetMaxBandwithRequest(tag: number, limit: number): ArrayBuffer {
        this.setHeadersToRequest(ECOpCodes.EC_OP_SET_PREFERENCES);
        const children = [{
            ecTag: tag * 2,
            ecOp: ECOpCodes.EC_TAGTYPE_UINT8,
            value: limit
        }];
        this.buildTagArrayBuffer(4864 * 2 + 1, 1, null, children); // 4864 is EC_TAG_PREFS_CONNECTIONS
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
        // Opcode (1) + TagCount (2) + tagName (2) + type (1) + length (4) = 10 bytes after header?
        // Header is 8 bytes.
        // The original code started reading at offset Uint32Array.BYTES_PER_ELEMENT * 2 = 8.

        let offset = 8;
        const dataView = new DataView(buffer, offset);

        // Opcode (1 byte)
        this.responseOpcode = dataView.getUint8(0);
        offset += 1;

        // Tag Count (2 bytes)
        // const tagCount = dataView.getUint16(1, false);
        offset += 2;

        // First Tag: Name (2), Type (1), Length (4)
        // const tagName = dataView.getUint16(3, false);
        offset += 2;
        // const tagType = dataView.getUint8(5);
        offset += 1;
        // const tagLen = dataView.getUint32(6, false);
        offset += 4;

        // If Opcode is 79 (0x4F) -> EC_OP_AUTH_SALT? (Actually 79 is not standard but maybe in amule it is)
        if (this.responseOpcode === 79) {
            this.salt = '';
            for (let i = 0; i < 8; i++) {
                let c = dataView.getUint8(10 + i).toString(16).toUpperCase(); // 10 is current offset relative to dataView start (which is offset 8 of buffer)
                // Wait, dataView was created at offset 8. So dataView.getUint8(10) is buffer[18].
                // Offset logic: 8 (header) + 1 + 2 + 2 + 1 + 4 = 18. Correct.

                if (c.length < 2) c = '0' + c;
                this.salt += c;
            }
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

            // Handle UTF-8 decoding
            const bufferBytes = Buffer.from(bytes);
            let str = '';
            if (this.stringDecoder) {
                str = this.stringDecoder.write(bufferBytes);
            } else {
                 str = bufferBytes.toString('utf-8');
            }

            // Remove null terminator if present
            if (str.endsWith('\0')) {
                str = str.substring(0, str.length - 1);
            }
            return str;
        } else if (node.typeEcOp === ECOpCodes.EC_TAGTYPE_HASH16) {
            let hash = '';
            for (let m = 0; m < node.length; m += 2) {
                let c = this.readBuffer(buffer, 2).toString(16);
                c = ('0000' + c).slice(-4);
                hash += c;
            }
            return hash;
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
                        const propName = key.split('EC_TAG_')[1].toLowerCase();
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
                     response['label'] = key.split('EC_TAG_')[1].toLowerCase();
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
