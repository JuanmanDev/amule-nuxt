/**
 * POST /api/amule/search
 * Perform a search
 * Body: { type: 'Global' | 'Kad' | 'Local', keyword: string }
 */

import type { ApiResponse } from '../../../../shared/types/api';
import { noteManualSearch } from '../../../utils/searchActivity';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const body = await readBody(event);

        if (!body?.type) {
            return {
                success: false,
                error: 'Search type is required'
            };
        }

        if (!body?.keyword) {
            return {
                success: false,
                error: 'Search keyword is required'
            };
        }

        const validTypes = ['Global', 'Kad', 'Local'];
        if (!validTypes.includes(body.type)) {
            return {
                success: false,
                error: `Invalid search type. Must be one of: ${validTypes.join(', ')}`
            };
        }

        // The automatic runner shares the daemon's single search slot; telling
        // it a person is searching makes it wait its turn.
        noteManualSearch();

        const client = getAmuleClient();
        const result = await client.search(body.type, body.keyword);

        return {
            success: result.success,
            message: result.message
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to perform search'
        };
    }
});
