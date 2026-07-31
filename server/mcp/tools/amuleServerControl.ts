import { z } from 'zod';

/**
 * Server list management. Removing a server is destructive, hence the confirm flag.
 */
export default defineMcpTool({
  description: 'Manage the eD2k server list: connect to a server, add one, remove one (destructive, confirm first), or reload the list from a server.met URL. Servers are addressed as ip:port.',
  inputSchema: {
    action: z.enum(['connect', 'add', 'remove', 'update-list']).describe('What to do'),
    address: z.string().optional().describe('Server address as ip:port (required for connect, add and remove)'),
    name: z.string().optional().describe('Display name when adding a server'),
    url: z.string().optional().describe('server.met URL for update-list (defaults to the configured one)'),
    confirm: z.boolean().optional().describe('Must be true for remove')
  },
  handler: async ({ action, address, name, url, confirm }) => {
    try {
      const client = getAmuleClient();

      if (action !== 'update-list' && !address) {
        return { isError: true, content: [{ type: 'text', text: 'An address (ip:port) is required for this action' }] };
      }
      if (action === 'remove' && confirm !== true) {
        return { isError: true, content: [{ type: 'text', text: 'Removing a server requires confirm: true' }] };
      }

      const result = action === 'connect'
        ? await client.connectToServer(address!)
        : action === 'add'
          ? await client.addServer(address!, name)
          : action === 'remove'
            ? await client.removeServer(address!)
            : await client.updateServerListFromUrl(url);

      return { isError: !result.success, content: [{ type: 'text', text: result.message }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error managing servers: ${error.message}` }] };
    }
  }
});
