import { z } from 'zod';

export default defineMcpTool({
  description: 'List the eD2k servers aMule knows, with address, users, files, ping, priority and failed connection count.',
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe('Maximum number of servers to return (default 25)')
  },
  handler: async ({ limit }) => {
    try {
      const client = getAmuleClient();
      const servers = await client.showServers();
      const top = [...servers].sort((a, b) => b.users - a.users).slice(0, limit ?? 25);

      return {
        content: [{ type: 'text', text: JSON.stringify({ total: servers.length, servers: top }, null, 2) }]
      };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error getting servers: ${error.message}` }] };
    }
  }
});
