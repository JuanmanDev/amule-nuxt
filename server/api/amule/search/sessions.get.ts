/**
 * GET /api/amule/search/sessions
 * Searches kept from the last seven days, newest first.
 *
 * Server-side on purpose: this is what lets a reload - or a different browser -
 * pick up the searches that were already run.
 */

import type { ApiResponse } from '../../../../shared/types/api';
import { listSearches, RETENTION_MS, type StoredSearch } from '../../../utils/searchStore';

export default defineEventHandler(async (): Promise<ApiResponse<{ searches: StoredSearch[]; retentionMs: number }>> => {
    try {
        return {
            success: true,
            data: { searches: await listSearches(), retentionMs: RETENTION_MS }
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not read the stored searches' };
    }
});
