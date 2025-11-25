/**
 * Composable for aMule API operations
 * Provides type-safe API client methods using useFetch
 */

export const useAmuleApi = () => {
    const config = useRuntimeConfig();

    // Helper to create API URLs
    const apiUrl = (path: string) => `/api/amule${path}`;

    return {
        // ========== Status & Connection ==========

        async getStatus() {
            return await $fetch(apiUrl('/status'));
        },

        async connect(network?: 'kad' | 'ed2k' | string) {
            return await $fetch(apiUrl('/connect'), {
                method: 'POST',
                body: { network }
            });
        },

        async disconnect(network?: 'kad' | 'ed2k') {
            return await $fetch(apiUrl('/disconnect'), {
                method: 'POST',
                body: { network }
            });
        },

        // ========== Downloads ==========

        async getDownloads() {
            return await $fetch(apiUrl('/downloads'));
        },

        async addDownload(link: string) {
            return await $fetch(apiUrl('/downloads/add'), {
                method: 'POST',
                body: { link }
            });
        },

        async pauseDownload(id: string) {
            return await $fetch(apiUrl(`/downloads/${id}/pause`), {
                method: 'POST'
            });
        },

        async resumeDownload(id: string) {
            return await $fetch(apiUrl(`/downloads/${id}/resume`), {
                method: 'POST'
            });
        },

        async cancelDownload(id: string) {
            return await $fetch(apiUrl(`/downloads/${id}/cancel`), {
                method: 'POST'
            });
        },

        async setPriority(id: string, priority: 'Auto' | 'High' | 'Normal' | 'Low') {
            return await $fetch(apiUrl(`/downloads/${id}/priority`), {
                method: 'POST',
                body: { priority }
            });
        },

        // ========== Search ==========

        async search(type: 'Global' | 'Kad' | 'Local', keyword: string) {
            return await $fetch(apiUrl('/search'), {
                method: 'POST',
                body: { type, keyword }
            });
        },

        async getSearchResults() {
            return await $fetch(apiUrl('/search/results'));
        },

        async downloadFromSearch(resultNumber: number) {
            return await $fetch(apiUrl('/search/download'), {
                method: 'POST',
                body: { resultNumber }
            });
        },

        // ========== Uploads & Servers ==========

        async getUploads() {
            return await $fetch(apiUrl('/uploads'));
        },

        async getServers() {
            return await $fetch(apiUrl('/servers'));
        },

        // ========== Statistics & Logs ==========

        async getStatistics() {
            return await $fetch(apiUrl('/statistics'));
        },

        async getLogs() {
            return await $fetch(apiUrl('/logs'));
        },

        // ========== Bandwidth ==========

        async getBandwidth() {
            return await $fetch(apiUrl('/bandwidth'));
        },

        async setBandwidth(uploadLimit: number, downloadLimit: number) {
            return await $fetch(apiUrl('/bandwidth'), {
                method: 'POST',
                body: { uploadLimit, downloadLimit }
            });
        }
    };
};
