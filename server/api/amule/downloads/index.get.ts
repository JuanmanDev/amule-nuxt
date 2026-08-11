/**
 * GET /api/amule/downloads
 * Returns download queue
 */

import type { ApiResponse } from '../../../../shared/types/api';
import type { Download } from '../../../utils/amule-types';

export default defineEventHandler(async (event): Promise<ApiResponse<Download[]>> => {
    try {
        const client = getAmuleECClient();
        const downloads = await client.getDownloads();

        return {
            success: true,
            // aMule cannot say when a download started or finished; the queue
            // watcher records both, and they are merged in here so the polled
            // queue carries the same information as the live one
            data: await withHistory(downloads)
        };
    } catch (error: any) {
        console.error('API Error:', error);
        return {
            success: false,
            error: error.message || 'Failed to get downloads'
        };
    }
});
