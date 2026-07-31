import { z } from 'zod';

/**
 * Pause, resume or reprioritise a queued download. Removal lives in its own
 * tool because it deletes data.
 */
export default defineMcpTool({
  description: 'Pause, resume or change the priority of an aMule download, addressed by its file hash (see amule-downloads).',
  inputSchema: {
    hash: z.string().regex(/^[0-9a-fA-F]{32}$/).describe('32 hex character file hash of the download'),
    action: z.enum(['pause', 'resume', 'priority']).describe('What to do with the download'),
    priority: z.enum(['Auto', 'High', 'Normal', 'Low']).optional().describe("Required when action is 'priority'")
  },
  handler: async ({ hash, action, priority }) => {
    try {
      const client = getAmuleClient();

      const result = action === 'pause'
        ? await client.pause(hash)
        : action === 'resume'
          ? await client.resume(hash)
          : await client.setPriority(hash, priority ?? 'Auto');

      return {
        isError: !result.success,
        content: [{ type: 'text', text: result.message }]
      };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error controlling download: ${error.message}` }] };
    }
  }
});
