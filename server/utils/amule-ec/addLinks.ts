/**
 * Adding links, in one place.
 *
 * Both the HTTP endpoint and the MCP tool use this, so a link that is already
 * queued or already shared is detected and reported identically. aMule accepts a
 * link whose hash it already knows and merely merges sources, which otherwise
 * looks like a successful add while nothing new appears in the queue.
 */

import type { AddLinkResult, AddLinksResult } from '../../../shared/types/api';
import type { AmuleECClient } from './AmuleECClient';
import { extractEd2kHash } from './links';

interface KnownFile {
    name: string;
    where: 'queue' | 'shared';
}

/** Indexes everything aMule already knows, keyed by file hash. */
async function loadKnownFiles(client: AmuleECClient): Promise<Map<string, KnownFile>> {
    const [queued, shared] = await Promise.all([
        client.getDownloads().catch(() => []),
        client.getSharedFiles().catch(() => [])
    ]);

    const known = new Map<string, KnownFile>();
    for (const file of shared) {
        if (file.hash) known.set(file.hash, { name: file.fileName, where: 'shared' });
    }
    // A queued entry wins: it is the more useful thing to point the user at
    for (const download of queued) {
        if (download.hash) known.set(download.hash, { name: download.name, where: 'queue' });
    }

    return known;
}

export async function addLinksWithStatus(
    client: AmuleECClient,
    rawLinks: string[]
): Promise<AddLinksResult> {
    const links = rawLinks.map(link => link.trim()).filter(link => link.length > 0);
    const known = await loadKnownFiles(client);
    const results: AddLinkResult[] = [];

    for (const link of links) {
        const response = await client.addLink(link);
        const duplicate = known.get(extractEd2kHash(link) ?? '');

        // A known hash is a duplicate either way: aMule merges sources for a queued
        // file (and answers OK) but refuses an already completed and shared one with
        // the generic "Invalid link or already on list", which on its own tells the
        // user nothing.
        if (duplicate) {
            results.push({
                link,
                success: true,
                status: 'duplicate',
                existingName: duplicate.name,
                message: duplicate.where === 'queue'
                    ? `Already in the download queue as '${duplicate.name}'${response.success ? ' - aMule merged the sources' : ''}`
                    : `Already downloaded and shared as '${duplicate.name}'`
            });
            continue;
        }

        if (!response.success) {
            results.push({ link, success: false, status: 'rejected', message: response.message });
            continue;
        }

        results.push({ link, success: true, status: 'added', message: response.message || 'Download added' });
    }

    return {
        results,
        added: results.filter(result => result.status === 'added').length,
        duplicates: results.filter(result => result.status === 'duplicate').length,
        rejected: results.filter(result => result.status === 'rejected').length
    };
}
