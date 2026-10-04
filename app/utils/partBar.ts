import type { DownloadPart, DownloadPartState } from '../../server/utils/amule-types';

/**
 * The eMule part bar draws one segment per ~9.28 MiB chunk. EC cannot supply the
 * map at all (it carries AVAILABLE_PARTS, a count, never a bitmap), so a caller
 * with no `parts` simply has nothing to draw.
 */
export const PART_BAR_MAX_SEGMENTS = 200;

export const PART_BAR_STATES: DownloadPartState[] = ['complete', 'pending', 'unavailable'];

export type PartSegment = { state: DownloadPartState; parts: number };

/**
 * Counts each state, so the legend always sums to the whole file.
 */
export function countParts(parts?: DownloadPart[] | null): Record<DownloadPartState, number> {
    const counts: Record<DownloadPartState, number> = { complete: 0, pending: 0, unavailable: 0 };
    for (const part of parts ?? []) counts[part.state]++;
    return counts;
}

/**
 * Buckets very large part maps: a 50 GiB file is ~5,500 parts, far more than the
 * bar has pixels. Adjacent parts fold into one segment carrying the worst state
 * in the group, so a partially-available region never paints itself green.
 */
export function buildSegments(parts?: DownloadPart[] | null): PartSegment[] {
    if (!parts?.length) return [];

    if (parts.length <= PART_BAR_MAX_SEGMENTS) {
        return parts.map(part => ({ state: part.state, parts: 1 }));
    }

    const step = Math.ceil(parts.length / PART_BAR_MAX_SEGMENTS);
    const buckets: PartSegment[] = [];

    for (let start = 0; start < parts.length; start += step) {
        let unavailable = 0;
        let pending = 0;

        for (let i = start; i < Math.min(start + step, parts.length); i++) {
            if (parts[i]!.state === 'unavailable') unavailable++;
            else if (parts[i]!.state === 'pending') pending++;
        }

        buckets.push({
            state: unavailable > 0 ? 'unavailable' : pending > 0 ? 'pending' : 'complete',
            parts: step
        });
    }

    return buckets;
}

export const ED2K_PART_SIZE = 9_728_000;

export interface DetailedDownloadPart {
    index: number;
    partNumber: number;
    state: DownloadPartState;
    sources: number;
    startByte: number;
    endByte: number;
    size: number;
    percent: number;
}

/**
 * Reconstructs part states from aMule EC download counts when the live
 * per-part bitmap from amuleapi is unavailable.
 */
export function synthesizePartsFromDownload(download: {
    size?: number;
    sizeDone?: number;
    availableParts?: number;
    sources?: number;
    status?: string;
    stopped?: boolean;
}): DownloadPart[] {
    const size = download.size ?? 0;
    if (size <= 0) return [];

    const total = Math.max(1, Math.ceil(size / ED2K_PART_SIZE));
    const sizeDone = download.sizeDone ?? 0;

    if (download.status === 'Complete' || sizeDone >= size) {
        return Array.from({ length: total }, () => ({
            state: 'complete' as const,
            sources: download.sources || 1
        }));
    }

    const complete = Math.min(total, Math.floor((sizeDone / size) * total));
    const available = Math.min(total, Math.max(complete, download.availableParts ?? total));

    return Array.from({ length: total }, (_, index) => {
        if (index < complete) {
            return { state: 'complete' as const, sources: download.sources || 1 };
        }
        if (index < available) {
            return { state: 'pending' as const, sources: Math.max(1, download.sources || 1) };
        }
        return { state: 'unavailable' as const, sources: 0 };
    });
}

/**
 * Builds rich part details including byte offsets, chunk boundaries, and
 * source counts for the detailed parts table/list.
 */
export function getDetailedParts(
    fileSize: number,
    parts?: DownloadPart[] | null
): DetailedDownloadPart[] {
    if (!parts?.length || fileSize <= 0) return [];

    return parts.map((part, index) => {
        const startByte = index * ED2K_PART_SIZE;
        const endByte = Math.min(fileSize, (index + 1) * ED2K_PART_SIZE);
        const size = Math.max(0, endByte - startByte);
        const percent = part.state === 'complete' ? 100 : 0;

        return {
            index,
            partNumber: index + 1,
            state: part.state,
            sources: part.sources,
            startByte,
            endByte,
            size,
            percent
        };
    });
}

