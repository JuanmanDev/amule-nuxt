/**
 * GET /api/amule/search/results
 * Get search results
 */

export default defineEventHandler(async (event) => {
    try {
        const client = getAmuleClient();
        const results = await client.getSearchResults();

        return {
            success: true,
            data: results
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get search results'
        };
    }
});
