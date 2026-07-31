/**
 * POST /api/amule/downloads/[id]/priority
 * Set download priority
 * Body: { priority: 'Auto' | 'High' | 'Normal' | 'Low' }
 */

import type { ApiResponse } from '../../../../../shared/types/api';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const id = getRouterParam(event, 'id');
        const body = await readBody(event);

        if (!id) {
            return {
                success: false,
                error: 'Download ID is required'
            };
        }

        if (!body?.priority) {
            return {
                success: false,
                error: 'Priority is required'
            };
        }

        const validPriorities = ['Auto', 'High', 'Normal', 'Low'];
        if (!validPriorities.includes(body.priority)) {
            return {
                success: false,
                error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}`
            };
        }

        const client = getAmuleClient();
        const result = await client.setPriority(id, body.priority);

        return {
            success: result.success,
            message: result.message
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to set priority'
        };
    }
});
