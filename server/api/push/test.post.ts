/**
 * POST /api/push/test
 * Sends a notification to every subscribed browser.
 *
 * Push has a long list of ways to be silently broken - permission, HTTPS, the
 * service worker, the operating system's own do-not-disturb - and none of them
 * report back. One button that proves the whole chain works is worth more than
 * any amount of status text.
 */

import type { ApiResponse } from '../../../shared/types/api';
import { broadcastPush } from '../../utils/webPush';

export default defineEventHandler(async (): Promise<ApiResponse<{ sent: number; failed: number }>> => {
    try {
        const result = await broadcastPush({
            title: 'aMule notifications work',
            body: 'This is what a download notification will look like.',
            url: '/downloads',
            tag: 'amule-test',
            kind: 'test'
        });

        if (result.sent === 0 && result.failed === 0) {
            return { success: false, error: 'No browser is subscribed to push notifications yet' };
        }

        return {
            success: result.sent > 0,
            message: `Sent to ${result.sent} browser(s)`,
            error: result.sent === 0 ? 'Every subscribed browser refused the notification' : undefined,
            data: result
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not send the test notification' };
    }
});
