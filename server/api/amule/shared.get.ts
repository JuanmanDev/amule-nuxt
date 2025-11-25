/**
 * GET /api/amule/shared
 * Returns shared files list (uploaded files)
 */

export default defineEventHandler(async () => {
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
            error: error.message || 'Failed to get shared files'
        };
    }
});
