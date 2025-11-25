/**
 * GET /api/amule/logs
 * Get log entries
 */

export default defineEventHandler(async (event) => {
    try {
        const client = getAmuleClient();
        const logs = await client.showLog();

        return {
            success: true,
            data: logs
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get logs'
        };
    }
});
