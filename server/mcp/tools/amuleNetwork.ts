import { z } from 'zod';

export default defineMcpTool({
  description: 'Connect or disconnect the aMule networks, or control Kad: start, stop, bootstrap from a known node, or reload nodes.dat from a URL.',
  inputSchema: {
    action: z
      .enum(['connect', 'disconnect', 'kad-start', 'kad-stop', 'kad-bootstrap', 'kad-update-nodes'])
      .describe('What to do'),
    network: z.enum(['ed2k', 'kad']).optional().describe('Limits connect / disconnect to one network'),
    ip: z.string().optional().describe('Node IP for kad-bootstrap'),
    port: z.number().int().min(1).max(65535).optional().describe('Node port for kad-bootstrap'),
    url: z.string().optional().describe('nodes.dat URL for kad-update-nodes')
  },
  handler: async ({ action, network, ip, port, url }) => {
    try {
      const client = getAmuleClient();

      let result;
      switch (action) {
        case 'connect':
          result = await client.connect(network);
          break;
        case 'disconnect':
          result = await client.disconnect(network);
          break;
        case 'kad-start':
          result = await client.setKadRunning(true);
          break;
        case 'kad-stop':
          result = await client.setKadRunning(false);
          break;
        case 'kad-bootstrap':
          if (!ip || !port) {
            return { isError: true, content: [{ type: 'text', text: 'kad-bootstrap needs both ip and port' }] };
          }
          result = await client.bootstrapKad(ip, port);
          break;
        default:
          result = await client.updateKadNodes(url ?? '');
      }

      return { isError: !result.success, content: [{ type: 'text', text: result.message }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error controlling the network: ${error.message}` }] };
    }
  }
});
