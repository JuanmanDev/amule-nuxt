/**
 * GET /api/amule/servers
 * Get server list
 */

import type { ApiResponse } from '../../../shared/types/api';
import type { Server } from '../../utils/amule-types';

export default defineEventHandler(async (event): Promise<ApiResponse<Server[]>> => {
    try {
        const client = getAmuleClient();
        const servers = await client.showServers();

        return {
            success: true,
            data: servers
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get servers'
        };
    }
});
