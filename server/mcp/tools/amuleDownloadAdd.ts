import { z } from 'zod';
import { splitLinks } from '../../../shared/utils/addLinks';
import { addLinksWithStatus } from '../../utils/amule-ec/addLinks';

export default defineMcpTool({
  description: 'Add one or more downloads to aMule from ed2k:// or magnet: links. Each link is reported as added, duplicate (already queued or already shared, so aMule only merged sources) or rejected with the reason.',
  inputSchema: {
    links: z.array(z.string()).min(1)
      .describe('ed2k:// or magnet: links to add. An entry holding several links is split, so a pasted batch works as one entry too')
  },
  handler: async ({ links }) => {
    try {
      // Same code path, and the same splitting, as POST /api/amule/downloads/add:
      // an agent that puts a whole pasted batch in one entry gets every link of it
      const data = await addLinksWithStatus(getAmuleClient(), links.flatMap(splitLinks));

      return {
        isError: data.rejected === data.results.length,
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
      };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error adding links: ${error.message}` }] };
    }
  }
});
