/**
 * POST /api/amule/search/download
 * Download a file from search results
 * Body: { resultNumber: number }
 */

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);

        if (body?.resultNumber === undefined) {
            return {
                success: false,
                error: 'Result number is required'
            };
        }

        const client = getAmuleClient();
        const result = await client.download(body.resultNumber);

        return {
            success: result.success,
            message: result.message
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to download from search results'
        };
    }
});
