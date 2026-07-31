/**
 * GET /api/amule/shared
 * Returns shared files list (uploaded files)
 */

import type { ApiResponse } from '../../../shared/types/api';
import type { Upload } from '../../utils/amule-types';

export default defineEventHandler(async (): Promise<ApiResponse<{ uploads: Upload[]; sharedFiles: any[] }>> => {
    try {
        const client = getAmuleClient();
        const uploads = await client.showUploads();
        const sharedFiles = await client.getSharedFiles();

        return {
            success: true,
            data: {
                uploads,
                sharedFiles
            }
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get shared files'
        };
    }
});
