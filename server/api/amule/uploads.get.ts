/**
 * GET /api/amule/uploads
 * Get upload queue
 */

export default defineEventHandler(async (event) => {
    try {
        const client = getAmuleClient();
        const uploads = await client.showUploads();

        return {
            success: true,
            data: uploads
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get uploads'
        };
    }
});
