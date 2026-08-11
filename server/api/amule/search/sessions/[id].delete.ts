/**
 * DELETE /api/amule/search/sessions/:id
 * Forgets one stored search. Closing a tab closes it everywhere.
 */

import type { ApiResponse } from '../../../../../shared/types/api';
import { removeSearch } from '../../../../utils/searchStore';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const id = getRouterParam(event, 'id');
        if (!id) return { success: false, error: 'A search id is required' };

        const removed = await removeSearch(decodeURIComponent(id));

        // Already gone is the outcome the caller wanted, so it is not an error
        return { success: true, message: removed ? 'Search forgotten' : 'That search was not stored' };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not remove the search' };
    }
});
