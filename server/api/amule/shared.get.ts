/**
 * GET /api/amule/shared
 * Returns the shared files this daemon offers.
 *
 * The active uploads used to be fetched here as well, which cost a second EC
 * round trip on an endpoint nothing read them from; /api/amule/uploads serves
 * those. It matters more now that this endpoint is polled in the background.
 */

import type { ApiResponse } from '../../../shared/types/api';
import type { SharedFile } from '../../utils/amule-types';

export default defineEventHandler(async (): Promise<ApiResponse<{ sharedFiles: SharedFile[] }>> => {
    try {
        const client = getAmuleClient();
        const sharedFiles = await client.getSharedFiles();

        return {
            success: true,
            data: { sharedFiles }
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get shared files'
        };
    }
});
