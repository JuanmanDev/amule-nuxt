import { z } from 'zod';

export default defineMcpTool({
  description: 'Get aMule transfer statistics: totals, current rates, limits, queued clients, shared file count and eD2k/Kad network size. Pass tree=true for the full statistics tree aMule maintains.',
  inputSchema: {
    tree: z.boolean().optional().describe('Return the full statistics tree instead of the summary')
  },
  handler: async ({ tree }) => {
    try {
      const client = getAmuleClient();
      const data = tree ? await client.getStatsTree() : await client.getStatistics();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error getting statistics: ${error.message}` }] };
    }
  }
});
