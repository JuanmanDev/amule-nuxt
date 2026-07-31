/**
 * Turns the per-link results of an add request into one message.
 *
 * Every place that can add a link (downloads page, dashboard, the modal in the
 * header, the add page) uses this, so a duplicate or a rejected link is always
 * reported the same way.
 */

import type { AddLinkResult, AddLinksResult } from '../types/api';

export interface AddLinksSummary {
    added: number;
    duplicates: number;
    rejected: number;
    total: number;
    /** Toast title. */
    title: string;
    /** Toast description; empty when the title says everything. */
    description?: string;
    color: 'success' | 'warning' | 'error';
    /** True when at least one link produced a new download. */
    anyAdded: boolean;
}

const listNames = (results: AddLinkResult[]) => results
    .map(result => result.existingName || result.link)
    .join(', ');

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function summariseAddResults(data: AddLinksResult | undefined | null): AddLinksSummary {
    const results = data?.results ?? [];
    const added = results.filter(result => result.status === 'added');
    const duplicates = results.filter(result => result.status === 'duplicate');
    const rejected = results.filter(result => result.status === 'rejected');

    const summary: AddLinksSummary = {
        added: added.length,
        duplicates: duplicates.length,
        rejected: rejected.length,
        total: results.length,
        title: 'Nothing to add',
        color: 'warning',
        anyAdded: added.length > 0
    };

    if (results.length === 0) {
        return summary;
    }

    // Single link: say exactly what happened to it
    if (results.length === 1) {
        const [only] = results as [AddLinkResult];
        return {
            ...summary,
            title: only.status === 'added'
                ? 'Download added'
                : only.status === 'duplicate'
                    ? 'Already in aMule'
                    : 'Link rejected',
            description: only.message,
            color: only.status === 'added' ? 'success' : only.status === 'duplicate' ? 'warning' : 'error'
        };
    }

    // Batch: lead with the counts, then explain the exceptions
    const parts: string[] = [];
    if (duplicates.length > 0) parts.push(`${plural(duplicates.length, 'link')} already in aMule: ${listNames(duplicates)}`);
    if (rejected.length > 0) parts.push(`${plural(rejected.length, 'link')} rejected: ${rejected.map(result => result.message).join('; ')}`);

    return {
        ...summary,
        title: added.length > 0
            ? `Added ${added.length} of ${results.length} links`
            : rejected.length === results.length
                ? 'No links added'
                : 'Nothing new added',
        description: parts.join(' | ') || undefined,
        color: rejected.length > 0 ? (added.length > 0 ? 'warning' : 'error') : duplicates.length > 0 ? 'warning' : 'success'
    };
}
