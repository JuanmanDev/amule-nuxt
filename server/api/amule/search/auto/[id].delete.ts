/**
 * DELETE /api/amule/search/auto/:id
 * Removes an automatic search and everything it accumulated.
 */

import type { ApiResponse } from '../../../../../shared/types/api';
import { removeAutoSearch } from '../../../../utils/autoSearchStore';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const id = getRouterParam(event, 'id');
        const removed = id ? await removeAutoSearch(id) : false;

        return removed
            ? { success: true, message: 'Automatic search removed' }
            : { success: false, error: 'No automatic search with that id' };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not remove the automatic search' };
    }
});
