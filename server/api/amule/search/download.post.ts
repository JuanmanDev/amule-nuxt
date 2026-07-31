/**
 * POST /api/amule/search/download
 * Download a file from search results
 * Body: { hash: string } or { resultNumber: number }
 */

import type { ApiResponse } from '../../../../shared/types/api';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const body = await readBody(event);

        const identifier = typeof body?.hash === 'string' ? body.hash : body?.resultNumber;

        if (identifier === undefined) {
            return {
                success: false,
                error: 'A file hash or result number is required'
            };
        }

        const client = getAmuleClient();
        const result = await client.download(identifier);

        return {
            success: result.success,
            message: result.success ? result.message : undefined,
            error: result.success ? undefined : result.message
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to download from search results'
        };
    }
});
