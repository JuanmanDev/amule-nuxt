import { z } from 'zod';

export default defineMcpTool({
  description: 'Get the aMule daemon status: External Connection state, ed2k and Kad connection state, connected server, client ID and current transfer speeds.',
  inputSchema: {},
  handler: async () => {
    try {
      const client = getAmuleClient();
      const status = await client.status();
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error getting aMule status: ${error.message}` }] };
    }
  }
});
