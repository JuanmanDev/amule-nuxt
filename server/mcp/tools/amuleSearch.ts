import { z } from 'zod';

export default defineMcpTool({
  description: 'Start a file search on the Kad or eD2k network, or on the connected server. Results keep arriving for a few seconds, so poll amule-search-results afterwards.',
  inputSchema: {
    keyword: z.string().min(1).describe('Search keywords'),
    network: z.enum(['Kad', 'Global', 'Local']).optional().describe('Network to search (default Kad)')
  },
  handler: async ({ keyword, network }) => {
    try {
      const client = getAmuleClient();
      const result = await client.search(network ?? 'Kad', keyword);
      return { isError: !result.success, content: [{ type: 'text', text: result.message }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error starting search: ${error.message}` }] };
    }
  }
});
