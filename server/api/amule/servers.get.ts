/**
 * GET /api/amule/servers
 * Get server list
 */

export default defineEventHandler(async (event) => {
    try {
        const client = getAmuleClient();
        const servers = await client.showServers();

        return {
            success: true,
            data: servers
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get servers'
        };
    }
});
