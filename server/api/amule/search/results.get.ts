/**
 * GET /api/amule/search/results
 * Get search results
 */

import type { ApiResponse } from '../../../../shared/types/api';
import type { SearchResultsPage } from '../../../utils/amule-backend';

export default defineEventHandler(async (): Promise<ApiResponse<SearchResultsPage>> => {
    try {
        const client = getAmuleClient();
        const data = await client.getSearchResults();

        return {
            success: true,
            data
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get search results'
        };
    }
});
