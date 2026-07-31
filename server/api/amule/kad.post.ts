/**
 * POST /api/amule/kad
 * Controls the Kad network.
 * Body: { action: 'start' | 'stop' | 'bootstrap' | 'update-nodes', ip?, port?, url? }
 */

import type { ApiResponse } from '../../../shared/types/api';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const body = await readBody(event);
        const client = getAmuleClient();

        let result;
        switch (body?.action) {
            case 'start':
                result = await client.setKadRunning(true);
                break;
            case 'stop':
                result = await client.setKadRunning(false);
                break;
            case 'bootstrap':
                if (!body?.ip || !body?.port) {
                    return { success: false, error: 'An ip and port are required to bootstrap Kad' };
                }
                result = await client.bootstrapKad(String(body.ip), Number(body.port));
                break;
            case 'update-nodes':
                result = await client.updateKadNodes(String(body?.url || ''));
                break;
            default:
                return { success: false, error: "action must be one of 'start', 'stop', 'bootstrap', 'update-nodes'" };
        }

        return {
            success: result.success,
            message: result.success ? result.message : undefined,
            error: result.success ? undefined : result.message
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to control Kad' };
    }
});
