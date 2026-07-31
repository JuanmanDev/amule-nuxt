/**
 * GET /api/amule/statistics/tree
 * Full statistics tree, formatted the way aMule's own GUI shows it
 */

import type { ApiResponse } from '../../../../shared/types/api';
import type { StatsTreeNode } from '../../../utils/amule-ec/statsTree';

export default defineEventHandler(async (event): Promise<ApiResponse<StatsTreeNode | null>> => {
    try {
        const query = getQuery(event);
        const capping = Number(query.capping ?? 10);

        const client = getAmuleClient();
        const tree = await client.getStatsTree(Number.isFinite(capping) ? capping : 10);

        return { success: true, data: tree };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to get the statistics tree' };
    }
});
