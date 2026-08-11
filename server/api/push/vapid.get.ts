/**
 * GET /api/push/vapid
 * The public key a browser needs to subscribe to this server's push messages.
 */

import type { ApiResponse } from '../../../shared/types/api';
import { listSubscriptions, vapidPublicKey } from '../../utils/webPush';

export default defineEventHandler(async (): Promise<ApiResponse<{ publicKey: string; subscribers: number }>> => {
    try {
        return {
            success: true,
            data: {
                publicKey: await vapidPublicKey(),
                // Shown in settings, so "notifications are on" can be told apart
                // from "this browser is subscribed but nothing else is"
                subscribers: (await listSubscriptions()).length
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Push notifications are unavailable' };
    }
});
