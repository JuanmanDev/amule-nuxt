import { z } from 'zod';

export default defineMcpTool({
  description: 'List the aMule download queue. Each entry includes the 32 hex character file hash needed by the other download tools, plus size, progress, speed, sources and status.',
  inputSchema: {},
  handler: async () => {
    try {
      const client = getAmuleClient();
      const downloads = await client.getDownloads();
      return { content: [{ type: 'text', text: JSON.stringify(downloads, null, 2) }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error getting aMule downloads: ${error.message}` }] };
    }
  }
});
