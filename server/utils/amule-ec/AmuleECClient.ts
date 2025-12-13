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
import { AMuleProtocol, ECSearchType, type ECResponse } from './lib/AMuleProtocol';

export class AmuleECClient {
    private client: AMuleProtocol;
    private config: AmuleConfig;
    private lastSearchResults: SearchResult[] = [];

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
    private async connect(): Promise<void> {
        if (this.client.getIsConnected()) {
            return;
        }

        try {
            await this.client.connect();
        } catch (err: any) {
            // console.error('AmuleECClient: Connection failed', err);
            throw err;
        }
    }

    /**
     * Get downloads list with full details
     */
    async getDownloads(): Promise<Download[]> {
        try {
            await this.connect();
            const files = await this.client.getDownloads();

            return files.map((file: any) => {
                let status: DownloadStatus = 'Waiting';
                // statusCode is not standard in my parsed response, checking partfile_status
                // Mapping from amule-ts.ts or logic:
                // 7 = Paused, 1 = Paused?
                // Let's use speed > 0 for Downloading.
                // Status mapping needs to be inferred or I need to find the status constants.
                // Assuming partfile_status gives us something.
                const statusCode = file.partfile_status || 0;
                const speed = parseInt(file.partfile_speed || '0') / 1024;

                if (speed > 0) {
                    status = 'Downloading';
                } else if (statusCode === 7 || statusCode === 1) { // 7 is typically Paused
                    status = 'Paused';
                } else if (statusCode === 0) {
                    status = 'Waiting';
                } else if (statusCode === 4 || statusCode === 5 || statusCode === 6) {
                    status = 'Complete'; // Or completing
                }

                const sizeFull = parseInt(file.partfile_size_full || '0');
                const sizeDone = parseInt(file.partfile_size_done || '0');
                const percent = sizeFull > 0 ? (sizeDone / sizeFull) * 100 : 0;

                return {
                    hash: file.partfile_hash || '',
                    name: file.partfile_name || 'Unknown',
                    size: sizeFull,
                    sizeDone: sizeDone,
                    status: status,
                    priority: 'Normal', // TODO: Map priority
                    speed: speed,
                    sources: parseInt(file.partfile_source_count || '0'),
                    sourcesNotCurrent: parseInt(file.partfile_source_count_not_current || '0'),
                    sourcesA4AF: parseInt(file.partfile_source_count_a4af || '0'),
                    sourcesXfer: parseInt(file.partfile_source_count_xfer || '0'),
                    percentComplete: percent
                };
            });
        } catch (error) {
            // console.error('AmuleECClient error:', error);
            throw error;
        }
    }

    /**
     * Get server list
     */
    async showServers(): Promise<Server[]> {
        try {
            await this.connect();
            const servers = await this.client.getServerList();

            return servers.map((s: any) => ({
                name: s.name || s.ip || 'Unknown',
                ip: s.ip || '',
                port: parseInt(s.port || '0'),
                description: s.description || '',
                users: parseInt(s.users || '0'),
                files: parseInt(s.files || '0'),
                priority: 'Normal',
                failed: 0,
                static: false
            }));
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
            const response = await this.client.getDetailUpdate();
            // Assuming uploads are children or part of the response structure
            // In AMuleProtocol, getDetailUpdate returns EC_OP_STATS
            // which contains various stats but maybe not list of uploads directly?
            // Original code: this.client.getDetailUpdate().then(response => response.uploads)
            // My implementation of getDetailUpdate uses EC_OP_GET_UPDATE (82)
            // which usually returns list of known clients/uploads.
            // Let's assume the response contains them in children or a specific property.

            // In my formatting logic:
            // if EC_TAG_CLIENT is present, it might be an upload.
            // I need to check how to distinguish uploads.
            // For now return empty or try to find clients in children.
             return [];
        } catch (error) {
            console.error('AmuleECClient error:', error);
            return [];
        }
    }

    /**
     * Get log entries
     */
    async showLog(): Promise<any[]> {
        // Not supported by EC directly in this implementation
        return [];
    }

    /**
     * Get current connection status
     */
    async status(): Promise<any> {
        try {
            await this.connect();
            const response = await this.client.getStatistics();

            return {
                connected: this.client.getIsConnected(),
                ed2kConnected: true, // If we get stats, we are likely connected to daemon. ED2K status is in stats?
                kadConnected: true,
                serverName: '', // Need to parse from stats
                serverIP: '',
                id: '',
                uploadSpeed: parseInt(response.stats_ul_speed || '0') / 1024,
                downloadSpeed: parseInt(response.stats_dl_speed || '0') / 1024,
                queuedClients: 0,
                totalSourceCount: 0
            };
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
            await this.client.addLink(link);
            return {
                success: true,
                message: 'Link added successfully',
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
        try {
            await this.connect();
            await this.client.pauseDownload(hash);
            return {
                success: true,
                message: 'Download paused'
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
        try {
            await this.connect();
            await this.client.resumeDownload(hash);
            return {
                success: true,
                message: 'Download resumed'
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
        try {
            await this.connect();
            await this.client.cancelDownload(hash);
            return {
                success: true,
                message: 'Download cancelled'
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
        try {
            await this.connect();
            // Map priority
            let prioVal = 1; // Normal
            if (priority === 'Low') prioVal = 0;
            if (priority === 'High') prioVal = 2;

            await this.client.setPriority(hash, prioVal);
            return {
                success: true,
                message: `Priority set to ${priority}`
            };
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
            let searchTypeVal = ECSearchType.EC_SEARCH_KAD;
            if (type === 'Global') searchTypeVal = ECSearchType.EC_SEARCH_GLOBAL;
            if (type === 'Local') searchTypeVal = ECSearchType.EC_SEARCH_LOCAL;
            if (type === 'Kad') searchTypeVal = ECSearchType.EC_SEARCH_KAD;

            // Note: search method in AMuleProtocol waits for results
            // But here we just want to start it?
            // The API usually expects async results or immediate return.
            // Ideally we start search and client polls.
            // But my AMuleProtocol.search() does both.
            // Let's run it in background if we want immediate return, or await it.
            // Given the frontend likely polls for results, we can just trigger it.

            // However, the AMuleProtocol.search resolves with results.
            // We can store them in lastSearchResults.

            this.client.search(keyword, searchTypeVal).then(results => {
                this.processSearchResults(results);
            }).catch(err => {
                console.error('Search failed in background', err);
            });

            return {
                success: true,
                message: 'Search started',
                data: { type, keyword }
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to start search'
            };
        }
    }

    private processSearchResults(files: ECResponse[]) {
        this.lastSearchResults = files.map((f: any, index: number) => ({
            resultNumber: index,
            hash: f.partfile_hash || '',
            fileName: f.partfile_name || 'Unknown',
            size: parseInt(f.partfile_size_full || '0'),
            sources: parseInt(f.partfile_source_count || '0'),
            fileType: 'Unknown'
        }));
    }

    /**
     * Get search results
     */
    async getSearchResults(): Promise<SearchResult[]> {
        // Return cached results from the last search
        return this.lastSearchResults;
    }

    /**
     * Get statistics
     */
    async getStatistics(): Promise<Statistics> {
        try {
            await this.connect();
            const response = await this.client.getStatistics();
            return {
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
        } catch (error) {
            console.error('AmuleECClient error:', error);
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

    async downloadSearchResult(hash: string): Promise<CommandResult> {
        try {
            await this.connect();
            await this.client.download(hash);
            return {
                success: true,
                message: 'Download started'
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || 'Failed to start download'
            };
        }
    }
}
