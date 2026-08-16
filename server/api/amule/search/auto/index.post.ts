/**
 * POST /api/amule/search/auto
 * Creates an automatic search.
 * Body: { keyword: string, networks: SearchType[], duration: '1h'|'1d'|'1w'|'1m'|'forever', intervalMs?: number }
 */

import type { ApiResponse } from '../../../../../shared/types/api';
import type { SearchType } from '../../../../utils/amule-types';
import {
    createAutoSearch,
    DURATIONS,
    type AutoSearch,
    type AutoSearchDuration
} from '../../../../utils/autoSearchStore';

const NETWORKS = new Set<SearchType>(['Kad', 'Global', 'Local']);

export default defineEventHandler(async (event): Promise<ApiResponse<{ search: AutoSearch }>> => {
    try {
        const body = await readBody(event);

        const keyword = typeof body?.keyword === 'string' ? body.keyword.trim().slice(0, 200) : '';
        if (!keyword) {
            return { success: false, error: 'An automatic search needs its keywords' };
        }

        const networks = Array.isArray(body?.networks)
            ? [...new Set(body.networks as SearchType[])].filter(network => NETWORKS.has(network))
            : [];
        if (networks.length === 0) {
            return { success: false, error: 'Pick at least one network of Kad, Global or Local' };
        }

        const duration = body?.duration as AutoSearchDuration;
        if (!(duration in DURATIONS)) {
            return { success: false, error: `The duration must be one of: ${Object.keys(DURATIONS).join(', ')}` };
        }

        const search = await createAutoSearch({
            keyword,
            networks,
            duration,
            intervalMs: Number(body?.intervalMs) || undefined
        });

        return { success: true, data: { search } };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not create the automatic search' };
    }
});
