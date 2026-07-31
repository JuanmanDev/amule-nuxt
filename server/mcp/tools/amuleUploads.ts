import { z } from 'zod';

export default defineMcpTool({
  description: 'List the clients aMule is currently uploading to, including the file, remote user, address, client software, speed, session and all-time bytes and queue position.',
  inputSchema: {},
  handler: async () => {
    try {
      const client = getAmuleClient();
      const uploads = await client.showUploads();
      return { content: [{ type: 'text', text: JSON.stringify(uploads, null, 2) }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error getting uploads: ${error.message}` }] };
    }
  }
});
