/**
 * Validation for the download links accepted by aMule (ed2k and magnet).
 *
 * The daemon is the final authority - it answers EC_OP_FAILED for links it
 * rejects - but it only reports "Invalid link or already on list", so these
 * checks exist to tell the user *what* is wrong with the link they pasted.
 */

export interface LinkValidationResult {
    valid: boolean;
    /** Reason the link was rejected, absent when valid. */
    error?: string;
}

const ED2K_HASH_LENGTH = 32;

/**
 * Validates an ed2k file link: ed2k://|file|<name>|<size>|<hash>|/
 * Trailing sections (sources, AICH hash, ...) are allowed and left to aMule.
 */
function validateEd2kLink(link: string): LinkValidationResult {
    const parts = link.split('|');

    // ['ed2k://', 'file', name, size, hash, ...rest]
    if (parts.length < 6 || parts[1] !== 'file') {
        return { valid: false, error: 'Not a valid ed2k file link (expected ed2k://|file|name|size|hash|/)' };
    }

    const [, , name, size, hash] = parts;

    if (!name || name.trim().length === 0) {
        return { valid: false, error: 'ed2k link has no file name' };
    }

    if (!size || !/^\d+$/.test(size)) {
        return { valid: false, error: `ed2k link has an invalid file size: '${size}' is not a number` };
    }

    if (Number(size) <= 0) {
        return { valid: false, error: 'ed2k link has a file size of 0' };
    }

    if (!hash || !/^[0-9a-fA-F]+$/.test(hash)) {
        return { valid: false, error: `ed2k link has a non-hexadecimal file hash: '${hash}'` };
    }

    if (hash.length !== ED2K_HASH_LENGTH) {
        return {
            valid: false,
            error: `ed2k link hash must be ${ED2K_HASH_LENGTH} hex characters, got ${hash.length}`
        };
    }

    return { valid: true };
}

/** Validates a magnet link: it must at least carry an xt (exact topic) parameter. */
function validateMagnetLink(link: string): LinkValidationResult {
    const query = link.slice('magnet:?'.length);
    const hasExactTopic = new URLSearchParams(query).has('xt');

    return hasExactTopic
        ? { valid: true }
        : { valid: false, error: 'magnet link has no xt (exact topic) parameter' };
}

/**
 * Returns the lowercased file hash of an ed2k file link, or null when the link
 * carries no usable hash.
 */
export function extractEd2kHash(link: unknown): string | null {
    if (typeof link !== 'string') return null;

    const parts = link.trim().split('|');
    const hash = parts.length >= 5 && parts[1] === 'file' ? parts[4] : undefined;

    return hash && new RegExp(`^[0-9a-fA-F]{${ED2K_HASH_LENGTH}}$`).test(hash)
        ? hash.toLowerCase()
        : null;
}

/**
 * Validates a link before it is handed to the daemon.
 * Only ed2k file links and magnet links are supported by EC_OP_ADD_LINK.
 */
export function validateDownloadLink(link: unknown): LinkValidationResult {
    if (typeof link !== 'string' || link.trim().length === 0) {
        return { valid: false, error: 'Link is empty' };
    }

    const trimmed = link.trim();

    if (trimmed.toLowerCase().startsWith('ed2k://')) {
        return validateEd2kLink(trimmed);
    }

    if (trimmed.toLowerCase().startsWith('magnet:?')) {
        return validateMagnetLink(trimmed);
    }

    return { valid: false, error: 'Unsupported link type (expected an ed2k:// or magnet: link)' };
}
