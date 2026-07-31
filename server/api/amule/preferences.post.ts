/**
 * POST /api/amule/preferences
 * Updates preferences. Every section is optional:
 * { nickname?, connection?: { maxUpload, maxDownload, maxConnections, maxSourcesPerFile },
 *   servers?: { removeDead, deadServerRetries, autoUpdate, addFromServer, addFromClient, updateUrl } }
 */

import type { ApiResponse } from '../../../shared/types/api';

export default defineEventHandler(async (event): Promise<ApiResponse<{ applied: string[] }>> => {
    try {
        const body = await readBody(event);
        const client = getAmuleClient();

        const applied: string[] = [];
        const failures: string[] = [];

        if (typeof body?.nickname === 'string') {
            const result = await client.setNickname(body.nickname);
            result.success ? applied.push('nickname') : failures.push(result.message);
        }

        if (body?.connection && typeof body.connection === 'object') {
            const result = await client.setConnectionPreferences(body.connection);
            result.success ? applied.push('connection') : failures.push(result.message);
        }

        if (body?.servers && typeof body.servers === 'object') {
            const result = await client.setServerPreferences(body.servers);
            result.success ? applied.push('servers') : failures.push(result.message);
        }

        if (applied.length === 0 && failures.length === 0) {
            return { success: false, error: 'Nothing to update' };
        }

        return {
            success: failures.length === 0,
            message: applied.length > 0 ? `Updated: ${applied.join(', ')}` : undefined,
            error: failures.length > 0 ? failures.join('; ') : undefined,
            data: { applied }
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to update preferences' };
    }
});
