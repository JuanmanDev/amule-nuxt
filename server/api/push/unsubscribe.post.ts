/**
 * POST /api/push/unsubscribe
 * Forgets a browser's push subscription.
 */

import type { ApiResponse } from '../../../shared/types/api';
import { removeSubscription } from '../../utils/webPush';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const body = await readBody(event);
        const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';

        if (!endpoint) {
            return { success: false, error: 'The subscription endpoint is required' };
        }

        const removed = await removeSubscription(endpoint);

        // Not finding it is the same outcome the caller wanted, so it is not an
        // error: a browser that unsubscribed twice is simply unsubscribed.
        return {
            success: true,
            message: removed ? 'This browser will no longer be notified' : 'This browser was not subscribed'
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not remove the subscription' };
    }
});
