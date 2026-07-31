/**
 * POST /api/amule/servers/add
 * Add an eD2k server
 * Body: { address: 'ip:port', name?: string }
 */

import type { ApiResponse } from '../../../../shared/types/api';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const body = await readBody(event);

        if (!body?.address) {
            return { success: false, error: 'Server address (ip:port) is required' };
        }

        const client = getAmuleClient();
        const result = await client.addServer(String(body.address).trim(), body.name ? String(body.name).trim() : undefined);

        return {
            success: result.success,
            message: result.success ? result.message : undefined,
            error: result.success ? undefined : result.message
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to add server' };
    }
});
