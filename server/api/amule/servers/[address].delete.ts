/**
 * DELETE /api/amule/servers/:address
 * Remove an eD2k server, addressed as "ip:port"
 */

import type { ApiResponse } from '../../../../shared/types/api';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const address = getRouterParam(event, 'address');

        if (!address) {
            return { success: false, error: 'Server address (ip:port) is required' };
        }

        const client = getAmuleClient();
        const result = await client.removeServer(decodeURIComponent(address));

        return {
            success: result.success,
            message: result.success ? result.message : undefined,
            error: result.success ? undefined : result.message
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to remove server' };
    }
});
