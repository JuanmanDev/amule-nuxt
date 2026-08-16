/**
 * POST /api/amule/search/auto/:id/resume
 * Resumes a stopped or finished automatic search.
 *
 * The clock restarts from now: a search made for "one day" and resumed a week
 * later gets another day, which is what resuming it means to the person doing
 * it. The accumulated results are kept and keep growing.
 */

import type { ApiResponse } from '../../../../../../shared/types/api';
import { DURATIONS, getAutoSearch, patchAutoSearch, type AutoSearch } from '../../../../../utils/autoSearchStore';

export default defineEventHandler(async (event): Promise<ApiResponse<{ search: AutoSearch }>> => {
    try {
        const id = getRouterParam(event, 'id');
        const existing = id ? await getAutoSearch(id) : null;

        if (!existing || !id) {
            return { success: false, error: 'No automatic search with that id' };
        }

        const now = Date.now();
        const span = DURATIONS[existing.duration];

        const search = await patchAutoSearch(id, {
            status: 'active',
            createdAt: now,
            endsAt: span === null ? null : now + span,
            nextRunAt: now
        });

        return { success: true, data: { search: search! } };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not resume the automatic search' };
    }
});
