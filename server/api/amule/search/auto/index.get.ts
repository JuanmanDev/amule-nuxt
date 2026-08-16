/**
 * GET /api/amule/search/auto
 * Every automatic search, newest first, without its result list.
 *
 * The lists are heavy — thousands of accumulated results across ten searches —
 * and the overview only needs the counts. One search's results come from
 * GET /api/amule/search/auto/:id.
 */

import type { ApiResponse } from '../../../../../shared/types/api';
import { listAutoSearches, type AutoSearch } from '../../../../utils/autoSearchStore';

export type AutoSearchSummary = Omit<AutoSearch, 'results'> & { resultCount: number };

export default defineEventHandler(async (): Promise<ApiResponse<{ searches: AutoSearchSummary[] }>> => {
    try {
        const searches = (await listAutoSearches()).map(({ results, ...rest }) => ({
            ...rest,
            resultCount: results.length
        }));

        return { success: true, data: { searches } };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not read the automatic searches' };
    }
});
