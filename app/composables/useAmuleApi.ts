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

/**
 * Options the polled reads accept.
 *
 * A poll needs to be able to give up. A browser that freezes a background tab
 * drops its connections without failing the requests that were in flight, so
 * those promises can hang for as long as the tab lives - and a caller that
 * serialises its polls behind an in-flight guard then never polls again. An
 * abort signal is how that is bounded.
 */
export interface ReadOptions {
    signal?: AbortSignal;
}

export const useAmuleApi = () => {
    // Helper to create API URLs
    const apiUrl = (path: string) => `/api/amule${path}`;

    return {
        // ========== Status & Connection ==========

        async getStatus(options: ReadOptions = {}) {
            return await $fetch<ApiResponse<StatusResult>>(apiUrl('/status'), { signal: options.signal });
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

        async getDownloads(options: ReadOptions = {}) {
            return await $fetch<ApiResponse<Download[]>>(apiUrl('/downloads'), { signal: options.signal });
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

        /** Searches kept server-side for a week, so a reload or another browser finds them. */
        async getStoredSearches() {
            return await $fetch<ApiResponse<{ searches: any[]; retentionMs: number }>>(apiUrl('/search/sessions'));
        },

        async storeSearch(search: Record<string, unknown>) {
            return await $fetch<ApiResponse<{ stored: number }>>(apiUrl('/search/sessions'), {
                method: 'POST',
                body: search
            });
        },

        async forgetSearch(id: string) {
            return await $fetch<ApiResponse>(apiUrl(`/search/sessions/${encodeURIComponent(id)}`), {
                method: 'DELETE'
            });
        },

        async downloadFromSearch(hash: string) {
            return await $fetch<ApiResponse>(apiUrl('/search/download'), {
                method: 'POST',
                body: { hash }
            });
        },

        // ========== Uploads & Servers ==========

        async getUploads(options: ReadOptions = {}) {
            return await $fetch<ApiResponse<Upload[]>>(apiUrl('/uploads'), { signal: options.signal });
        },

        async getSharedFiles(options: ReadOptions = {}) {
            return await $fetch<ApiResponse<{ sharedFiles: SharedFile[] }>>(apiUrl('/shared'), { signal: options.signal });
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
