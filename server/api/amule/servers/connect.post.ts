/**
 * POST /api/amule/servers/connect
 * Connect to one specific eD2k server
 * Body: { address: 'ip:port' }
 */

import type { ApiResponse } from '../../../../shared/types/api';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const body = await readBody(event);

        if (!body?.address) {
            return { success: false, error: 'Server address (ip:port) is required' };
        }

        const client = getAmuleClient();
        const result = await client.connectToServer(String(body.address).trim());

        return {
            success: result.success,
            message: result.success ? result.message : undefined,
            error: result.success ? undefined : result.message
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to connect to server' };
    }
});
