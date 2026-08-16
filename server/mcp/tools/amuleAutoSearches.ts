import { z } from 'zod';
import { listAutoSearches, getAutoSearch } from '../../utils/autoSearchStore';

/**
 * The read side of the automatic searches: the overview without result lists,
 * or one search with the results it has accumulated so far.
 */
export default defineMcpTool({
  description: 'List the automatic searches the server keeps re-running, or read one by id including its accumulated results. Results are deduplicated by file hash across passes; each carries the eD2k link amule-download-add accepts.',
  inputSchema: {
    id: z.string().optional().describe('Read this search with its results; omit for the overview of all searches'),
    limit: z.number().int().min(1).max(200).optional().describe('Maximum results to return for one search, sorted by source count (default 25)')
  },
  handler: async ({ id, limit }) => {
    try {
      if (!id) {
        const searches = (await listAutoSearches()).map(({ results, ...rest }) => ({
          ...rest,
          resultCount: results.length
        }));
        return { content: [{ type: 'text', text: JSON.stringify({ searches }, null, 2) }] };
      }

      const search = await getAutoSearch(id);
      if (!search) {
        return { isError: true, content: [{ type: 'text', text: `No automatic search with id ${id}` }] };
      }

      const top = [...search.results].sort((a, b) => b.sources - a.sources).slice(0, limit ?? 25);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ...search, resultCount: search.results.length, results: top }, null, 2)
        }]
      };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error reading automatic searches: ${error.message}` }] };
    }
  }
});
