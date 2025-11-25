/**
 * POST /api/amule/downloads/add
 * Add a new download
 * Body: { link: string }
 */

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);

        if (!body?.link) {
            return {
                success: false,
                error: 'Link is required'
            };
        }

        const client = getAmuleClient();
        const result = await client.addLink(body.link);

        return {
            success: result.success,
            message: result.message
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to add download'
        };
    }
});
