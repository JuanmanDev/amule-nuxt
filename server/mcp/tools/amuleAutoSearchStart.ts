import { z } from 'zod';
import { createAutoSearch } from '../../utils/autoSearchStore';
import type { SearchType } from '../../utils/amule-types';

export default defineMcpTool({
  description: 'Create an automatic search the server re-runs every few minutes for the chosen time span (or until stopped), cycling the chosen networks and accumulating results deduplicated by file hash. Useful for finding files on machines that are not online right now. Follow up with amule-auto-searches.',
  inputSchema: {
    keyword: z.string().min(1).describe('Search keywords'),
    networks: z.array(z.enum(['Kad', 'Global', 'Local'])).min(1).optional().describe('Networks cycled pass by pass (default Kad and Global)'),
    duration: z.enum(['1h', '1d', '1w', '1m', 'forever']).optional().describe('How long to keep re-running: an hour, a day, a week, a month, or forever until stopped (default 1d)')
  },
  handler: async ({ keyword, networks, duration }) => {
    try {
      const search = await createAutoSearch({
        keyword,
        networks: [...new Set<SearchType>(networks ?? ['Kad', 'Global'])],
        duration: duration ?? '1d'
      });

      const { results, ...summary } = search;
      return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error creating the automatic search: ${error.message}` }] };
    }
  }
});
