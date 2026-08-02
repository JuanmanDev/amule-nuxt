/**
 * Composable for aMule API operations
 * Every endpoint answers with the shared ApiResponse envelope, so the calls
 * below stay typed on the client side.
 */

import type { ApiResponse, AddLinksResult } from '#shared/types/api';
import type {
    AmulePreferences,
    BandwidthLimits,
    Download,
    DownloadPriority,
    SearchResult,
    Server,
    SharedFile,
    Statistics,
    StatusResult,
    Upload
} from '../../server/utils/amule-types';
import type { StatsTreeNode } from '../../server/utils/amule-ec/statsTree';
import type { SpeedHistoryResponse } from '../../server/api/amule/statistics/history.get';

export const useAmuleApi = () => {
    // Helper to create API URLs
    const apiUrl = (path: string) => `/api/amule${path}`;

    return {
        // ========== Status & Connection ==========

        async getStatus() {
            return await $fetch<ApiResponse<StatusResult>>(apiUrl('/status'));
        },

        async connect(network?: 'kad' | 'ed2k') {
            return await $fetch<ApiResponse>(apiUrl('/connect'), {
                method: 'POST',
                body: { network }
            });
        },

        async disconnect(network?: 'kad' | 'ed2k') {
            return await $fetch<ApiResponse>(apiUrl('/disconnect'), {
                method: 'POST',
                body: { network }
            });
        },

        // ========== Downloads ==========

        async getDownloads() {
            return await $fetch<ApiResponse<Download[]>>(apiUrl('/downloads'));
        },

        async addDownload(links: string | string[]) {
            return await $fetch<ApiResponse<AddLinksResult>>(apiUrl('/downloads/add'), {
                method: 'POST',
                body: Array.isArray(links) ? { links } : { link: links }
            });
        },

        async pauseDownload(id: string) {
            return await $fetch<ApiResponse>(apiUrl(`/downloads/${id}/pause`), {
                method: 'POST'
            });
        },

        async resumeDownload(id: string) {
            return await $fetch<ApiResponse>(apiUrl(`/downloads/${id}/resume`), {
                method: 'POST'
            });
        },

        async cancelDownload(id: string) {
            return await $fetch<ApiResponse>(apiUrl(`/downloads/${id}/cancel`), {
                method: 'POST'
            });
        },

        async setPriority(id: string, priority: DownloadPriority) {
            return await $fetch<ApiResponse>(apiUrl(`/downloads/${id}/priority`), {
                method: 'POST',
                body: { priority }
            });
        },

        // ========== Search ==========

        async search(type: 'Global' | 'Kad' | 'Local', keyword: string) {
            return await $fetch<ApiResponse>(apiUrl('/search'), {
                method: 'POST',
                body: { type, keyword }
            });
        },

        async getSearchResults() {
            return await $fetch<ApiResponse<{ results: SearchResult[]; progress: number }>>(apiUrl('/search/results'));
        },

        async stopSearch() {
            return await $fetch<ApiResponse>(apiUrl('/search/stop'), { method: 'POST' });
        },

        async downloadFromSearch(hash: string) {
            return await $fetch<ApiResponse>(apiUrl('/search/download'), {
                method: 'POST',
                body: { hash }
            });
        },

        // ========== Uploads & Servers ==========

        async getUploads() {
            return await $fetch<ApiResponse<Upload[]>>(apiUrl('/uploads'));
        },

        async getSharedFiles() {
            return await $fetch<ApiResponse<{ sharedFiles: SharedFile[] }>>(apiUrl('/shared'));
        },

        async getServers() {
            return await $fetch<ApiResponse<Server[]>>(apiUrl('/servers'));
        },

        async addServer(address: string, name?: string) {
            return await $fetch<ApiResponse>(apiUrl('/servers/add'), {
                method: 'POST',
                body: { address, name }
            });
        },

        async removeServer(address: string) {
            return await $fetch<ApiResponse>(apiUrl(`/servers/${encodeURIComponent(address)}`), {
                method: 'DELETE'
            });
        },

        async connectToServer(address: string) {
            return await $fetch<ApiResponse>(apiUrl('/servers/connect'), {
                method: 'POST',
                body: { address }
            });
        },

        // ========== Statistics & Logs ==========

        async getStatistics() {
            return await $fetch<ApiResponse<Statistics>>(apiUrl('/statistics'));
        },

        async getLogs() {
            return await $fetch<ApiResponse<string[]>>(apiUrl('/logs'));
        },

        async getSpeedHistory(minutes = 30) {
            return await $fetch<ApiResponse<SpeedHistoryResponse>>(apiUrl('/statistics/history'), {
                query: { minutes }
            });
        },

        async getStatsTree(capping = 10) {
            return await $fetch<ApiResponse<StatsTreeNode | null>>(apiUrl('/statistics/tree'), {
                query: { capping }
            });
        },

        // ========== Preferences, server list and Kad ==========

        async getPreferences() {
            return await $fetch<ApiResponse<AmulePreferences>>(apiUrl('/preferences'));
        },

        async setPreferences(body: {
            nickname?: string;
            connection?: Partial<AmulePreferences['connection']>;
            servers?: Partial<AmulePreferences['servers']>;
        }) {
            return await $fetch<ApiResponse<{ applied: string[] }>>(apiUrl('/preferences'), {
                method: 'POST',
                body
            });
        },

        async getServerInfo() {
            return await $fetch<ApiResponse<string[]>>(apiUrl('/serverinfo'));
        },

        async updateServerList(url?: string) {
            return await $fetch<ApiResponse>(apiUrl('/servers/update'), {
                method: 'POST',
                body: { url }
            });
        },

        async controlKad(body: { action: 'start' | 'stop' | 'bootstrap' | 'update-nodes'; ip?: string; port?: number; url?: string }) {
            return await $fetch<ApiResponse>(apiUrl('/kad'), {
                method: 'POST',
                body
            });
        },

        // ========== Bandwidth ==========

        async getBandwidth() {
            return await $fetch<ApiResponse<BandwidthLimits>>(apiUrl('/bandwidth'));
        },

        async setBandwidth(uploadLimit: number, downloadLimit: number) {
            return await $fetch<ApiResponse<BandwidthLimits>>(apiUrl('/bandwidth'), {
                method: 'POST',
                body: { uploadLimit, downloadLimit }
            });
        }
    };
};
