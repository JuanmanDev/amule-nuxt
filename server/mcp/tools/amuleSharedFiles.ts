import { z } from 'zod';

export default defineMcpTool({
  description: 'List the files aMule shares, with size, requests, accepted requests, bytes uploaded, share ratio, queued clients and the ed2k link.',
  inputSchema: {
    filter: z.string().optional().describe('Only return files whose name contains this text'),
    limit: z.number().int().min(1).max(500).optional().describe('Maximum number of files to return (default 50)')
  },
  handler: async ({ filter, limit }) => {
    try {
      const client = getAmuleClient();
      const files = await client.getSharedFiles();

      const needle = filter?.trim().toLowerCase();
      const selected = (needle ? files.filter(file => file.fileName.toLowerCase().includes(needle)) : files)
        .sort((a, b) => b.transferredAll - a.transferredAll)
        .slice(0, limit ?? 50);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ total: files.length, returned: selected.length, files: selected }, null, 2)
        }]
      };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error getting shared files: ${error.message}` }] };
    }
  }
});
