/**
 * POST /api/amule/search/sessions
 * Stores one search, so it survives a reload and reaches other browsers.
 */

import type { ApiResponse } from '../../../../shared/types/api';
import { saveSearch, type StoredSearch } from '../../../utils/searchStore';

const STATUSES = new Set(['running', 'done', 'stopped', 'failed']);
const TYPES = new Set(['Global', 'Kad', 'Local']);

export default defineEventHandler(async (event): Promise<ApiResponse<{ stored: number }>> => {
    try {
        const body = await readBody(event);

        // Validated rather than trusted: this goes into a file that is read back
        // and handed to every browser, so a malformed entry would keep breaking
        // the search page until someone deleted it by hand.
        if (typeof body?.id !== 'string' || !body.id.trim()) {
            return { success: false, error: 'A search needs an id' };
        }
        if (typeof body?.keyword !== 'string' || !body.keyword.trim()) {
            return { success: false, error: 'A search needs its keywords' };
        }
        if (!TYPES.has(body?.type)) {
            return { success: false, error: 'A search needs a network of Global, Kad or Local' };
        }

        const now = Date.now();
        const search: StoredSearch = {
            id: body.id.trim().slice(0, 64),
            keyword: body.keyword.trim().slice(0, 200),
            type: body.type,
            startedAt: Number(body.startedAt) || now,
            updatedAt: Number(body.updatedAt) || now,
            status: STATUSES.has(body?.status) ? body.status : 'done',
            results: Array.isArray(body?.results) ? body.results : [],
            error: typeof body?.error === 'string' ? body.error.slice(0, 500) : undefined
        };

        const stored = await saveSearch(search);

        return { success: true, data: { stored: stored.length } };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not store the search' };
    }
});
