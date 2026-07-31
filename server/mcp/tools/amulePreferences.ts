import { z } from 'zod';

export default defineMcpTool({
  description: 'Read or change aMule preferences: nickname, bandwidth limits (KB/s, 0 = unlimited) and connection limits. Call with no arguments to read the current values; any argument given is applied and the resulting preferences are returned.',
  inputSchema: {
    nickname: z.string().optional().describe('New client nickname'),
    maxUpload: z.number().int().min(0).optional().describe('Upload limit in KB/s, 0 = unlimited'),
    maxDownload: z.number().int().min(0).optional().describe('Download limit in KB/s, 0 = unlimited'),
    maxConnections: z.number().int().min(0).optional().describe('Maximum number of connections'),
    maxSourcesPerFile: z.number().int().min(0).optional().describe('Maximum sources per file')
  },
  handler: async ({ nickname, maxUpload, maxDownload, maxConnections, maxSourcesPerFile }) => {
    try {
      const client = getAmuleClient();
      const changes: string[] = [];

      if (nickname !== undefined) {
        changes.push((await client.setNickname(nickname)).message);
      }

      const connection = { maxUpload, maxDownload, maxConnections, maxSourcesPerFile };
      if (Object.values(connection).some(value => value !== undefined)) {
        changes.push((await client.setConnectionPreferences(connection)).message);
      }

      const preferences = await client.getPreferences();
      return {
        content: [{ type: 'text', text: JSON.stringify({ changes, preferences }, null, 2) }]
      };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error with preferences: ${error.message}` }] };
    }
  }
});
