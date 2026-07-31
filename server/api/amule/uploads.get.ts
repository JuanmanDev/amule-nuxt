/**
 * GET /api/amule/uploads
 * Get upload queue
 */

import type { ApiResponse } from '../../../shared/types/api';
import type { Upload } from '../../utils/amule-types';

export default defineEventHandler(async (event): Promise<ApiResponse<Upload[]>> => {
    try {
        const client = getAmuleClient();
        const uploads = await client.showUploads();

        return {
            success: true,
            data: uploads
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get uploads'
        };
    }
});
