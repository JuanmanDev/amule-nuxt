/**
 * POST /api/amule/search/stop
 * Stop the running search
 */

import type { ApiResponse } from '../../../../shared/types/api';

export default defineEventHandler(async (): Promise<ApiResponse> => {
    try {
        const client = getAmuleClient();
        const result = await client.stopSearch();

        return {
            success: result.success,
            message: result.success ? result.message : undefined,
            error: result.success ? undefined : result.message
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to stop search' };
    }
});
