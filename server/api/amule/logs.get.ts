/**
 * GET /api/amule/logs
 * Get log entries
 */

import type { ApiResponse } from '../../../shared/types/api';

export default defineEventHandler(async (event): Promise<ApiResponse<string[]>> => {
    try {
        const client = getAmuleClient();
        const logs = await client.showLog();

        return {
            success: true,
            data: logs
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get logs'
        };
    }
});
