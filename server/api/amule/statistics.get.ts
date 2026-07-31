/**
 * GET /api/amule/statistics
 * Get aMule statistics
 */

import type { ApiResponse } from '../../../shared/types/api';
import type { Statistics } from '../../utils/amule-types';

export default defineEventHandler(async (event): Promise<ApiResponse<Statistics>> => {
    try {
        const client = getAmuleClient();
        const statistics = await client.getStatistics();

        return {
            success: true,
            data: statistics
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get statistics'
        };
    }
});
