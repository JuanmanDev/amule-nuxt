/**
 * POST /api/push/subscribe
 * Stores a browser's push subscription so it can be notified with no tab open.
 */

import type { ApiResponse } from '../../../shared/types/api';
import { addSubscription } from '../../utils/webPush';

export default defineEventHandler(async (event): Promise<ApiResponse> => {
    try {
        const body = await readBody(event);
        const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
        const p256dh = body?.keys?.p256dh;
        const auth = body?.keys?.auth;

        // Everything here is handed straight to the push service, so a subscription
        // missing a key would only fail later, once per notification, forever.
        if (!endpoint || typeof p256dh !== 'string' || typeof auth !== 'string') {
            return { success: false, error: 'A push subscription needs an endpoint and both keys' };
        }

        if (!/^https:\/\//i.test(endpoint)) {
            return { success: false, error: 'A push endpoint must be an https URL' };
        }

        await addSubscription({
            endpoint,
            keys: { p256dh, auth },
            createdAt: Date.now(),
            label: typeof body?.label === 'string' ? body.label.slice(0, 120) : undefined
        });

        return { success: true, message: 'This browser will be notified about downloads' };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not store the subscription' };
    }
});
