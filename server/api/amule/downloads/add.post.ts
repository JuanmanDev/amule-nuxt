/**
 * POST /api/amule/downloads/add
 * Add one or more downloads
 * Body: { link: string } or { links: string[] }
 *
 * Either field may itself carry several links - separated by newlines, by spaces or
 * glued together - and each one is added on its own. The same splitting the UI does,
 * so a caller pasting a batch into `link` gets the batch rather than the first of
 * it. That includes the MCP tool, which passes what the agent gives it.
 */

import type { ApiResponse, AddLinksResult } from '../../../../shared/types/api';
import { splitLinks } from '../../../../shared/utils/addLinks';
import { addLinksWithStatus } from '../../../utils/amule-ec/addLinks';

export default defineEventHandler(async (event): Promise<ApiResponse<AddLinksResult>> => {
    try {
        const body = await readBody(event);

        const linksToProcess: string[] = [];
        if (Array.isArray(body?.links)) {
            linksToProcess.push(...body.links);
        } else if (typeof body?.link === 'string') {
            linksToProcess.push(body.link);
        }

        const links = linksToProcess.flatMap(entry =>
            typeof entry === 'string' ? splitLinks(entry) : []
        );

        if (links.length === 0) {
            return { success: false, error: 'At least one link is required' };
        }

        const data = await addLinksWithStatus(getAmuleClient(), links);

        // Only report success when no link was refused, so a rejected link is never
        // presented as added. Duplicates are successful but reported as such.
        return {
            success: data.rejected === 0,
            message: `Added ${data.added} of ${data.results.length} links`,
            error: data.rejected > 0
                ? data.results.filter(result => result.status === 'rejected').map(result => result.message).join('; ')
                : undefined,
            data
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to add download'
        };
    }
});
