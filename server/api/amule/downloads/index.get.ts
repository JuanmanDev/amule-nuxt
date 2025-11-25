/**
 * GET /api/amule/downloads
 * Returns download queue
 */

export default defineEventHandler(async (event) => {
    try {
        const client = getAmuleECClient();
        const downloads = await client.getDownloads();

        return {
            success: true,
            data: downloads
        };
    } catch (error: any) {
        console.error('API Error:', error);
        return {
            success: false,
            error: error.message || 'Failed to get downloads',
            details: error.toString(),
            stack: error.stack
        };
    }
});
