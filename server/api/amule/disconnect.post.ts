/**
 * POST /api/amule/disconnect
 * Disconnect from network(s)
 * Body: { network?: 'kad' | 'ed2k' }
 */

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const client = getAmuleClient();

        const result = await client.disconnect(body?.network);

        return {
            success: result.success,
            message: result.message
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to disconnect'
        };
    }
});
