/**
 * GET /api/amule/shared/[hash]
 * One shared file with the detail fields amuleapi (aMule 3.1) adds: the
 * directory it lives in, the upload queue, per-part availability and media
 * metadata. Over EC this is the list entry, which already carries everything
 * EC knows.
 */

import type { ApiResponse } from '../../../../shared/types/api';
import type { SharedFile } from '../../../utils/amule-types';

export default defineEventHandler(async (event): Promise<ApiResponse<SharedFile>> => {
    const hash = getRouterParam(event, 'hash');

    if (!hash || !isValidFileHash(hash)) {
        return { success: false, error: 'A 32 character file hash is required' };
    }

    try {
        const file = await getAmuleClient().getSharedFile(hash);
        if (!file) {
            return { success: false, error: 'No shared file with that hash' };
        }

        const [decorated] = await withHistory([file]);
        return { success: true, data: decorated ?? file };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to get the shared file' };
    }
});
