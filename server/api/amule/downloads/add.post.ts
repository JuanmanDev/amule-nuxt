/**
 * POST /api/amule/downloads/add
 * Add one or more downloads
 * Body: { link: string } or { links: string[] }
 */

import type { ApiResponse, AddLinksResult } from '../../../../shared/types/api';
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

        const links = linksToProcess.map(link => link.trim()).filter(link => link.length > 0);

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
