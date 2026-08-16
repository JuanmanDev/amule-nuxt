import { z } from 'zod';
import { DURATIONS, getAutoSearch, patchAutoSearch, removeAutoSearch } from '../../utils/autoSearchStore';

/**
 * Stop, resume or delete an automatic search. Deleting throws away everything
 * the search accumulated, which is why the server instructions tell agents to
 * confirm it with the user first.
 */
export default defineMcpTool({
  description: 'Stop, resume or delete an automatic search by id (see amule-auto-searches). Stopping keeps the accumulated results; deleting discards them, so confirm deletions with the user. Resuming restarts the clock: the search gets its full duration again from now.',
  inputSchema: {
    id: z.string().describe('Id of the automatic search'),
    action: z.enum(['stop', 'resume', 'delete']).describe('What to do with it')
  },
  handler: async ({ id, action }) => {
    try {
      const existing = await getAutoSearch(id);
      if (!existing) {
        return { isError: true, content: [{ type: 'text', text: `No automatic search with id ${id}` }] };
      }

      if (action === 'delete') {
        await removeAutoSearch(id);
        return { content: [{ type: 'text', text: `Automatic search "${existing.keyword}" and its results were removed` }] };
      }

      if (action === 'stop') {
        await patchAutoSearch(id, { status: 'stopped' });
        return { content: [{ type: 'text', text: `Automatic search "${existing.keyword}" stopped; its results are kept` }] };
      }

      const now = Date.now();
      const span = DURATIONS[existing.duration];
      await patchAutoSearch(id, {
        status: 'active',
        createdAt: now,
        endsAt: span === null ? null : now + span,
        nextRunAt: now
      });
      return { content: [{ type: 'text', text: `Automatic search "${existing.keyword}" resumed for another ${existing.duration}` }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Error controlling the automatic search: ${error.message}` }] };
    }
  }
});
