/**
 * GET /api/amule/status
 * Returns current aMule daemon connection status
 */

export default defineEventHandler(async (event) => {
    try {
        const client = getAmuleClient();
        const status = await client.status();

        return {
            success: true,
            data: status
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get status'
        };
    }
});
