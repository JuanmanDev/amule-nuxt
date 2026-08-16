/**
 * POST /api/amule/search/auto/:id/stop
 * Stops an automatic search. Its accumulated results stay.
 */

import type { ApiResponse } from '../../../../../../shared/types/api';
import { getAutoSearch, patchAutoSearch, type AutoSearch } from '../../../../../utils/autoSearchStore';

export default defineEventHandler(async (event): Promise<ApiResponse<{ search: AutoSearch }>> => {
    try {
        const id = getRouterParam(event, 'id');
        const existing = id ? await getAutoSearch(id) : null;

        if (!existing || !id) {
            return { success: false, error: 'No automatic search with that id' };
        }

        const search = await patchAutoSearch(id, { status: 'stopped' });
        return { success: true, data: { search: search! } };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not stop the automatic search' };
    }
});
