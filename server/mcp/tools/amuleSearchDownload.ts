import { z } from 'zod';

export default defineMcpTool({
  description: 'Queue a file from the current aMule search results for download, addressed by its file hash (see amule-search-results).',
  inputSchema: {
    hash: z.string().regex(/^[0-9a-fA-F]{32}$/).describe('32 hex character file hash of the search result')
  },
  handler: async ({ hash }) => {
    try {
      const client = getAmuleClient();
      const result = await client.download(hash);
      return { isError: !result.success, content: [{ type: 'text', text: result.message }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error downloading search result: ${error.message}` }] };
    }
  }
});
