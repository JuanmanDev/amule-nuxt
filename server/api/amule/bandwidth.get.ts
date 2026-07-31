/**
 * GET /api/amule/bandwidth
 * Get bandwidth limits
 */

import type { ApiResponse } from '../../../shared/types/api';
import type { BandwidthLimits } from '../../utils/amule-types';

export default defineEventHandler(async (event): Promise<ApiResponse<BandwidthLimits>> => {
    try {
        const client = getAmuleClient();
        const limits = await client.getBandwidthLimits();

        return {
            success: true,
            data: limits
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get bandwidth limits'
        };
    }
});
