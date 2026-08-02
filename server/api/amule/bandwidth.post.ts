/**
 * POST /api/amule/bandwidth
 * Set bandwidth limits
 * Body: { uploadLimit: number, downloadLimit: number } (in kB/s, 0 = unlimited)
 */

import type { ApiResponse } from '../../../shared/types/api';
import type { BandwidthLimits } from '../../utils/amule-types';
import { normalizeBandwidthLimit } from '../../utils/amule-ec/AmuleECClient';

export default defineEventHandler(async (event): Promise<ApiResponse<BandwidthLimits>> => {
    try {
        const body = await readBody(event);

        if (body?.uploadLimit === undefined || body?.downloadLimit === undefined) {
            return {
                success: false,
                error: 'Both uploadLimit and downloadLimit are required'
            };
        }

        // Validate here rather than letting a bad value reach the EC tag: an
        // unparsable limit is written as 0, which is aMule's "unlimited".
        let uploadLimit: number;
        let downloadLimit: number;
        try {
            uploadLimit = normalizeBandwidthLimit(body.uploadLimit, 'uploadLimit');
            downloadLimit = normalizeBandwidthLimit(body.downloadLimit, 'downloadLimit');
        } catch (error: any) {
            return { success: false, error: error.message };
        }

        const client = getAmuleClient();
        const result = await client.setBandwidthLimits({ uploadLimit, downloadLimit });

        return {
            success: result.success,
            message: result.success ? result.message : undefined,
            error: result.success ? undefined : result.message,
            data: result.data
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to set bandwidth limits'
        };
    }
});
