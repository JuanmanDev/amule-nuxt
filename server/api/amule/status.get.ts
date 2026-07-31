/**
 * GET /api/amule/status
 * Returns current aMule daemon connection status
 */

import type { ApiResponse } from '../../../shared/types/api';
import type { StatusResult } from '../../utils/amule-types';

export default defineEventHandler(async (event): Promise<ApiResponse<StatusResult>> => {
    try {
        const client = getAmuleClient();
        const status = await client.status();

        return {
            success: true,
            data: status
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get status'
        };
    }
});
