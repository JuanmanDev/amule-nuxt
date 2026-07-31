/**
 * GET /api/amule/statistics/history?minutes=30
 * Rolling transfer-rate history sampled by the server
 */

import type { ApiResponse } from '../../../../shared/types/api';
import { getSpeedHistoryStats, type SpeedSample } from '../../../utils/speedHistory';

export interface SpeedHistoryResponse {
    samples: SpeedSample[];
    peakUpload: number;
    peakDownload: number;
    averageUpload: number;
    averageDownload: number;
}

export default defineEventHandler(async (event): Promise<ApiResponse<SpeedHistoryResponse>> => {
    try {
        const minutes = Number(getQuery(event).minutes ?? 30);
        return {
            success: true,
            data: getSpeedHistoryStats(Number.isFinite(minutes) ? Math.min(120, Math.max(1, minutes)) : 30)
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to read the speed history' };
    }
});
