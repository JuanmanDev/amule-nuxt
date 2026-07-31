/**
 * POST /api/amule/servers/update
 * Reloads the server list from a URL (defaults to the configured one)
 * Body: { url?: string }
 */

import type { ApiResponse } from '../../../../shared/types/api';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const body = await readBody(event).catch(() => ({}));
        const client = getAmuleClient();
        const result = await client.updateServerListFromUrl(body?.url);

        return {
            success: result.success,
            message: result.success ? result.message : undefined,
            error: result.success ? undefined : result.message
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to update the server list' };
    }
});
