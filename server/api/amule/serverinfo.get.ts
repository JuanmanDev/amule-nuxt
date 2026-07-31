/**
 * GET /api/amule/serverinfo
 * Message of the day / info lines of the connected eD2k server
 */

import type { ApiResponse } from '../../../shared/types/api';

export default defineEventHandler(async (): Promise<ApiResponse<string[]>> => {
    try {
        const client = getAmuleClient();
        return { success: true, data: await client.getServerInfo() };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to get server info' };
    }
});
