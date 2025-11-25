/**
 * GET /api/amule/bandwidth
 * Get bandwidth limits
 */

export default defineEventHandler(async (event) => {
    try {
        const client = getAmuleClient();
        const limits = await client.getBandwidthLimits();

        return {
            success: true,
            data: limits
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get bandwidth limits'
        };
    }
});
