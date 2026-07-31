/**
 * Response envelope shared by every /api/amule/* endpoint.
 * Handlers annotate their return type with this so the client side keeps
 * `data` / `error` typed instead of collapsing into an unknown union.
 */
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

/**
 * Outcome of adding one link.
 * - `added`: aMule queued a new download
 * - `duplicate`: the file was already queued or already shared, so aMule only
 *   merged sources and nothing new appears in the queue
 * - `rejected`: the link was refused (bad format, filtered, unusable hash)
 */
export type AddLinkStatus = 'added' | 'duplicate' | 'rejected';

export interface AddLinkResult {
    link: string;
    /** True unless the daemon refused the link; a duplicate still counts as success. */
    success: boolean;
    status: AddLinkStatus;
    message: string;
    /** Name of the existing download or shared file, when this was a duplicate. */
    existingName?: string;
}

export interface AddLinksResult {
    results: AddLinkResult[];
    added: number;
    duplicates: number;
    rejected: number;
}
