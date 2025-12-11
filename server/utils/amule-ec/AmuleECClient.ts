import { createRequire } from 'module';
import type {
    AmuleConfig,
    Download,
    DownloadStatus,
    DownloadPriority,
    Server,
    SearchResult,
    Statistics,
    CommandResult,
    SearchType
} from '../amulecmd/types';
import { StringDecoder } from 'string_decoder';

import { resolve } from 'path';

const require = createRequire(import.meta.url);
// Resolve path relative to project root
const amulePath = resolve(process.cwd(), 'server/utils/amule-ec/lib/amule.cjs');
const amule = require(amulePath);
const md5 = require('blueimp-md5');

export class AmuleECClient {
    private client: any;
    private config: AmuleConfig;
    private lastSearchResults: SearchResult[] = [];

    constructor(config: AmuleConfig) {
        this.config = config;
        // Initialize amule-js client
        this.client = new amule.AMuleCli(
            config.host,
            Number(config.port),
            config.password,
            md5
        );

        // Initialize StringDecoder for proper UTF-8 character handling
        this.client.setStringDecoder(new StringDecoder('utf8'));
    }

    /**
     * Connect to aMule EC
     */
    private async connect(): Promise<void> {
        if (this.client.isConnected) {
            return; // Silently return if already connected
        }

        return new Promise((resolve, reject) => {
            this.client.connect()
                .then(() => {
                    resolve();
                })
                .catch((err: any) => {
                    // console.error('AmuleECClient: Connection failed', err);
                    this.client.isConnected = false;
                    reject(err);
                });
        });
    }

    /**
     * Get downloads list with full details
     */
    async getDownloads(): Promise<Download[]> {
        try {
            await this.connect();

            return new Promise((resolve, reject) => {
                this.client.getDownloads().then((response: any) => {
                    // response might be the array itself or contain children
                    const files = Array.isArray(response) ? response : (response.children || []);

                    const downloads: Download[] = files.map((file: any) => {
                        let status: DownloadStatus = 'Waiting';
                        const statusCode = file.partfile_status || 0;
                        // Speed is in bytes/s, convert to KB/s
                        const speed = parseInt(file.partfile_speed || '0') / 1024;

                        // Simple status mapping logic
                        if (speed > 0) {
                            status = 'Downloading';
                        } else if (statusCode === 1 || statusCode === 7) {
                            status = 'Paused';
                        } else if (statusCode === 0) {
                            status = 'Waiting';
                        } else if (statusCode === 4 || statusCode === 5 || statusCode === 6) {
                            status = 'Complete';
                        }

                        // Calculate percent complete
                        const sizeFull = parseInt(file.partfile_size_full || '0');
                        const sizeDone = parseInt(file.partfile_size_done || '0');
                        const percent = sizeFull > 0 ? (sizeDone / sizeFull) * 100 : 0;

                        return {
                            hash: file.partfile_hash || '',
                            name: file.partfile_name || 'Unknown',
                            size: sizeFull,
                            sizeDone: sizeDone,
                            status: status,
                            priority: 'Normal', // TODO: Map priority if available
                            speed: speed,
                            sources: parseInt(file.partfile_source_count || '0'),
                            sourcesNotCurrent: parseInt(file.partfile_source_count_not_current || '0'),
                            sourcesA4AF: parseInt(file.partfile_source_count_a4af || '0'),
                            sourcesXfer: parseInt(file.partfile_source_count_xfer || '0'),
                            percentComplete: percent
                        };
                    });
                    resolve(downloads);
                }).catch((err: any) => reject(err));
            });
        } catch (error) {
            console.error('AmuleECClient error:', error);
            throw error;
        }
    }

    /**
     * Get server list
     */
    async showServers(): Promise<Server[]> {
        try {
            await this.connect();
            return new Promise((resolve, reject) => {
                // Wrap the request method with sendToServer
                this.client.sendToServer(this.client.getServerListRequest()).then((response: any) => {
                    const servers = Array.isArray(response) ? response : (response.children || []);
                    const parsedServers: Server[] = servers.map((s: any) => ({
                        name: s.name || s.ip || 'Unknown',
                        ip: s.ip || '',
                        port: parseInt(s.port || '0'),
                        description: s.description || '',
                        users: parseInt(s.users || '0'),
                        files: parseInt(s.files || '0'),
                        priority: 'Normal', // Default
                        failed: 0,
                        static: false
                    }));
                    resolve(parsedServers);
                }).catch((err: any) => reject(err));
            });
        } catch (error) {
            console.error('AmuleECClient error:', error);
            throw error;
        }
    }

    /**
     * Get uploads list
     */
    async showUploads(): Promise<any[]> {
        try {
            await this.connect();
            // Use getDetailUpdate to get upload/download info
            return new Promise((resolve, reject) => {
                this.client.getDetailUpdate().then((response: any) => {
                    // Extract uploads from the response
                    const uploads = response?.uploads || [];
                    resolve(uploads);
                }).catch((err: any) => reject(err));
            });
        } catch (error) {
            console.error('AmuleECClient error:', error);
            return [];
        }
    }

    /**
     * Get log entries
     */
    async showLog(): Promise<any[]> {
        try {
            await this.connect();
            // amule.cjs doesn't have a log method, return empty for now
            // The EC protocol may not support this directly
            return [];
        } catch (error) {
            console.error('AmuleECClient error:', error);
            return [];
        }
    }

    /**
     * Get current connection status
     */
    async status(): Promise<any> {
        try {
            await this.connect();
            return new Promise((resolve, reject) => {
                // Use getStatistiques to get status information
                this.client.getStatistiques().then((response: any) => {
                    const status = {
                        connected: this.client.isConnected || false,
                        ed2kConnected: false, // EC protocol doesn't provide this directly
                        kadConnected: false, // EC protocol doesn't provide this directly
                        serverName: '',
                        serverIP: '',
                        id: '',
                        uploadSpeed: parseInt(response.stats_ul_speed || '0') / 1024, // Convert to KB/s
                        downloadSpeed: parseInt(response.stats_dl_speed || '0') / 1024, // Convert to KB/s
                        queuedClients: 0,
                        totalSourceCount: 0
                    };
                    resolve(status);
                }).catch((err: any) => reject(err));
            });
        } catch (error) {
            console.error('AmuleECClient error:', error);
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
        try {
            await this.connect();
            return new Promise((resolve, reject) => {
                this.client.sendToServer_simple(this.client.addLinkRequest(link)).then(() => {
                    resolve({
                        success: true,
                        message: 'Link added successfully',
                        data: { link }
                    });
                }).catch((err: any) => reject(err));
            });
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
        try {
            await this.connect();
            return new Promise((resolve, reject) => {
                this.client.sendToServer_simple(this.client.getPauseDownloadRequest(hash)).then(() => {
                    resolve({
                        success: true,
                        message: 'Download paused'
                    });
                }).catch((err: any) => reject(err));
            });
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
        try {
            await this.connect();
            return new Promise((resolve, reject) => {
                this.client.sendToServer_simple(this.client.getResumeDownloadRequest(hash)).then(() => {
                    resolve({
                        success: true,
                        message: 'Download resumed'
                    });
                }).catch((err: any) => reject(err));
            });
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
        try {
            await this.connect();
            return this.client.cancelDownload({ partfile_hash: hash }).then(() => {
                return {
                    success: true,
                    message: 'Download cancelled'
                };
            }).catch((err: any) => {
                return {
                    success: false,
                    message: err.message || 'Failed to cancel download'
                };
            });
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
        try {
            await this.connect();
            // Map priority string to integer if needed by EC
            // Low=0, Normal=1, High=2, Auto=3? 
            // Need to verify mapping. amule.cjs doesn't show mapping.
            // Assuming standard mapping: Low=0, Normal=1, High=2, VeryHigh=3, Auto=4?
            // Let's use 1 for Normal for now.
            let prioVal = 1;
            if (priority === 'Low') prioVal = 0;
            if (priority === 'High') prioVal = 2;

            return new Promise((resolve, reject) => {
                this.client.sendToServer_simple(this.client.getSetPriorityRequest(hash, prioVal)).then(() => {
                    resolve({
                        success: true,
                        message: `Priority set to ${priority}`
                    });
                }).catch((err: any) => reject(err));
            });
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to set priority'
            };
        }
    }

    /**
     * Perform search
     */
    async search(type: SearchType, keyword: string): Promise<CommandResult> {
        try {
            await this.connect();
            // Map search type to EC integer
            // EC_SEARCH_LOCA: 0x00, EC_SEARCH_GLOBAL: 0x01, EC_SEARCH_KAD: 0x02, EC_SEARCH_WEB: 0x03
            let searchTypeVal = 0;
            if (type === 'Global') searchTypeVal = 1;
            if (type === 'Kad') searchTypeVal = 2;

            return new Promise((resolve, reject) => {
                this.client.__search(keyword, searchTypeVal).then(() => {
                    resolve({
                        success: true,
                        message: 'Search started',
                        data: { type, keyword }
                    });
                }).catch((err: any) => reject(err));
            });
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to start search'
            };
        }
    }

    /**
     * Get search results
     */
    async getSearchResults(): Promise<SearchResult[]> {
        try {
            await this.connect();
            return new Promise((resolve, reject) => {
                this.client.fetchSearch().then((response: any) => {
                    const files = Array.isArray(response) ? response : (response.children || []);
                    const results: SearchResult[] = files.map((f: any, index: number) => ({
                        resultNumber: index,
                        hash: f.partfile_hash || '',
                        fileName: f.partfile_name || 'Unknown',
                        size: parseInt(f.partfile_size_full || '0'),
                        sources: parseInt(f.partfile_source_count || '0'),
                        fileType: 'Unknown'
                    }));
                    this.lastSearchResults = results;
                    resolve(results);
                }).catch((err: any) => reject(err));
            });
        } catch (error) {
            console.error('AmuleECClient error:', error);
            return [];
        }
    }

    /**
     * Get statistics
     */
    async getStatistics(): Promise<Statistics> {
        try {
            await this.connect();
            return new Promise((resolve, reject) => {
                // Use the existing getStatistiques() method which wraps getStatsRequest()
                this.client.getStatistiques().then((response: any) => {
                    // Map response to Statistics interface
                    const stats: Statistics = {
                        uptime: 0,
                        totalUploaded: parseInt(response.stats_total_sent_bytes || '0'),
                        totalDownloaded: parseInt(response.stats_total_received_bytes || '0'),
                        sessionUploaded: 0,
                        sessionDownloaded: 0,
                        uploadRate: parseInt(response.stats_ul_speed || '0'),
                        downloadRate: parseInt(response.stats_dl_speed || '0'),
                        connectedClients: 0,
                        totalClients: 0,
                        sharedFiles: 0
                    };
                    resolve(stats);
                }).catch((err: any) => reject(err));
            });
        } catch (error) {
            console.error('AmuleECClient error:', error);
            throw error;
        }
    }

    /**
     * Download a file from search results
     * Supports downloading by result number (index) or hash
     */
    async download(identifier: number | string): Promise<CommandResult> {
        let hash = '';

        if (typeof identifier === 'number') {
            // Find by index in last search results
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

    /**
     * Download a file using hash (internal)
     */
    async downloadSearchResult(hash: string): Promise<CommandResult> {
        try {
            await this.connect();
            return new Promise((resolve, reject) => {
                this.client.sendToServer_simple(this.client.downloadRequest({ partfile_hash: hash })).then(() => {
                    resolve({
                        success: true,
                        message: 'Download started'
                    });
                }).catch((err: any) => reject(err));
            });
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to start download'
            };
        }
    }
}
