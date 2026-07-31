import { z } from 'zod';

export default defineMcpTool({
  description: 'Return the results collected so far for the running (or last) aMule search, sorted by source count. Each result carries the file hash needed by amule-search-download.',
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe('Maximum number of results (default 25)')
  },
  handler: async ({ limit }) => {
    try {
      const client = getAmuleClient();
      const { results, progress } = await client.getSearchResults();
      const top = [...results].sort((a, b) => b.sources - a.sources).slice(0, limit ?? 25);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ progress, total: results.length, results: top }, null, 2)
        }]
      };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error getting search results: ${error.message}` }] };
    }
  }
});
