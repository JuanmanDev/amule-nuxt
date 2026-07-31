import { z } from 'zod';
import { addLinksWithStatus } from '../../utils/amule-ec/addLinks';

export default defineMcpTool({
  description: 'Add one or more downloads to aMule from ed2k:// or magnet: links. Each link is reported as added, duplicate (already queued or already shared, so aMule only merged sources) or rejected with the reason.',
  inputSchema: {
    links: z.array(z.string()).min(1).describe('ed2k:// or magnet: links to add')
  },
  handler: async ({ links }) => {
    try {
      // Same code path as POST /api/amule/downloads/add
      const data = await addLinksWithStatus(getAmuleClient(), links);

      return {
        isError: data.rejected === data.results.length,
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
      };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error adding links: ${error.message}` }] };
    }
  }
});
