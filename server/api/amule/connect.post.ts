/**
 * POST /api/amule/connect
 * Connect to network(s)
 * Body: { network?: 'kad' | 'ed2k' | string }
 */

import type { ApiResponse } from '../../../shared/types/api';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const body = await readBody(event);
        const client = getAmuleClient();

        const result = await client.connect(body?.network);

        return {
            success: result.success,
            message: result.message
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to connect'
        };
    }
});
