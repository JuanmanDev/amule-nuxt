import { createRequire } from 'module';
import type { AmuleConfig, Download, DownloadStatus, DownloadPriority } from '../amulecmd/types';
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
}
