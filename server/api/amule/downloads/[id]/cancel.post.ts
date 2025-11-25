/**
 * POST /api/amule/downloads/[id]/cancel
 * Cancel a download
 */

export default defineEventHandler(async (event) => {
    try {
        const id = getRouterParam(event, 'id');

        if (!id) {
            return {
                success: false,
                error: 'Download ID is required'
            };
        }

        const client = getAmuleClient();
        const result = await client.cancel(id);

        return {
            success: result.success,
            message: result.message
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to cancel download'
        };
    }
});
