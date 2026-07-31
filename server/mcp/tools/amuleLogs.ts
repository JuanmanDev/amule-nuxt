import { z } from 'zod';

export default defineMcpTool({
  description: 'Read the aMule daemon log. Useful to find out why an action failed, because aMule logs the detailed reason there while the External Connection only returns a short message.',
  inputSchema: {
    lines: z.number().int().min(1).max(500).optional().describe('How many of the most recent lines to return (default 50)'),
    filter: z.string().optional().describe('Only return lines containing this text')
  },
  handler: async ({ lines, filter }) => {
    try {
      const client = getAmuleClient();
      const log = await client.showLog();
      const needle = filter?.trim().toLowerCase();
      const selected = (needle ? log.filter(line => line.toLowerCase().includes(needle)) : log)
        .slice(-(lines ?? 50));

      return { content: [{ type: 'text', text: selected.join('\n') || 'The log is empty' }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error reading the log: ${error.message}` }] };
    }
  }
});
