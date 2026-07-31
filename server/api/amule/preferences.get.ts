/**
 * GET /api/amule/preferences
 * aMule preferences the UI can show and edit
 */

import type { ApiResponse } from '../../../shared/types/api';
import type { AmulePreferences } from '../../utils/amule-types';

export default defineEventHandler(async (): Promise<ApiResponse<AmulePreferences>> => {
    try {
        const client = getAmuleClient();
        return { success: true, data: await client.getPreferences() };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to read preferences' };
    }
});
