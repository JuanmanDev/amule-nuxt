/**
 * GET /api/amule/search/auto/:id
 * One automatic search with everything it has accumulated.
 */

import type { ApiResponse } from '../../../../../shared/types/api';
import { getAutoSearch, type AutoSearch } from '../../../../utils/autoSearchStore';

export default defineEventHandler(async (event): Promise<ApiResponse<{ search: AutoSearch }>> => {
    try {
        const id = getRouterParam(event, 'id');
        const search = id ? await getAutoSearch(id) : null;

        if (!search) {
            return { success: false, error: 'No automatic search with that id' };
        }

        return { success: true, data: { search } };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not read the automatic search' };
    }
});
