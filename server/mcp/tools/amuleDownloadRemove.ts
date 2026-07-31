import { z } from 'zod';

export default defineMcpTool({
  description: 'DESTRUCTIVE: remove a download from the aMule queue. aMule deletes the data downloaded so far. Confirm with the user before calling this.',
  inputSchema: {
    hash: z.string().regex(/^[0-9a-fA-F]{32}$/).describe('32 hex character file hash of the download to remove'),
    confirm: z.literal(true).describe('Must be true to acknowledge that partial data is deleted')
  },
  handler: async ({ hash }) => {
    try {
      const client = getAmuleClient();
      const result = await client.cancel(hash);
      return { isError: !result.success, content: [{ type: 'text', text: result.message }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error removing download: ${error.message}` }] };
    }
  }
});
