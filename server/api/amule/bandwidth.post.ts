/**
 * POST /api/amule/bandwidth
 * Set bandwidth limits
 * Body: { uploadLimit: number, downloadLimit: number } (in KB/s, 0 = unlimited)
 */

import type { ApiResponse } from '../../../shared/types/api';
import type { BandwidthLimits } from '../../utils/amule-types';

export default defineEventHandler(async (event): Promise<ApiResponse<BandwidthLimits>> => {
    try {
        const body = await readBody(event);

        if (body?.uploadLimit === undefined || body?.downloadLimit === undefined) {
            return {
                success: false,
                error: 'Both uploadLimit and downloadLimit are required'
            };
        }

        const client = getAmuleClient();
        const result = await client.setBandwidthLimits({
            uploadLimit: body.uploadLimit,
            downloadLimit: body.downloadLimit
        });

        return {
            success: result.success,
            message: result.message,
            data: result.data
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to set bandwidth limits'
        };
    }
});
