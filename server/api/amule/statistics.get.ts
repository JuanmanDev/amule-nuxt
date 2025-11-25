/**
 * GET /api/amule/statistics
 * Get aMule statistics
 */

export default defineEventHandler(async (event) => {
    try {
        const client = getAmuleClient();
        const statistics = await client.getStatistics();

        return {
            success: true,
            data: statistics
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get statistics'
        };
    }
});
