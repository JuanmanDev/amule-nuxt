/**
 * GET /api/amule/downloads/[id]
 * One download with everything the daemon can say about it.
 *
 * Over amuleapi (aMule 3.1) that is the detail view: the per-part map, the
 * daemon's ETA, media metadata, corruption figures. Over EC it is the queue
 * entry, which has no part map - the details view draws an estimate instead.
 * The queue list never carries the detail fields, so only the one open
 * download pays for them.
 */

import type { ApiResponse } from '../../../../../shared/types/api';
import type { Download } from '../../../../utils/amule-types';

export default defineEventHandler(async (event): Promise<ApiResponse<Download>> => {
    const id = getRouterParam(event, 'id');

    if (!id || !isValidFileHash(id)) {
        return {
            success: false,
            error: 'A 32 character download hash is required'
        };
    }

    try {
        const download = await getAmuleClient().getDownload(id);

        if (!download) {
            return {
                success: false,
                error: 'No download with that hash'
            };
        }

        // The same history the list endpoint merges in, so the dates agree.
        const [decorated] = await withHistory([download]);

        return {
            success: true,
            data: decorated ?? download
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get download'
        };
    }
});
