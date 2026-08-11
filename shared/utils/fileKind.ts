/**
 * What kind of file a name looks like.
 *
 * A search result is a name, a size and a hash — the daemon says nothing about
 * what the file *is*. The extension is the only thing there is to go on, and it
 * is enough to give every row an icon and to let the user filter a hundred
 * results down to "the videos".
 *
 * Deliberately coarse: the point is to sort a result list at a glance, not to
 * identify formats. Anything unrecognised is `other`, which is honest.
 */

export type FileKind = 'video' | 'audio' | 'image' | 'archive' | 'document' | 'program' | 'disc' | 'other';

interface KindDefinition {
    label: string;
    icon: string;
    extensions: string[];
}

export const FILE_KINDS: Record<FileKind, KindDefinition> = {
    video: {
        label: 'Video',
        icon: 'i-heroicons-film',
        extensions: ['mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mpg', 'mpeg', 'm4v', 'ts', 'm2ts', 'ogv', 'divx', 'rmvb', '3gp', 'vob']
    },
    audio: {
        label: 'Audio',
        icon: 'i-heroicons-musical-note',
        extensions: ['mp3', 'flac', 'ogg', 'oga', 'opus', 'wav', 'aac', 'm4a', 'wma', 'ape', 'alac', 'mid', 'midi', 'aiff']
    },
    image: {
        label: 'Image',
        icon: 'i-heroicons-photo',
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'svg', 'heic', 'avif', 'psd']
    },
    archive: {
        label: 'Archive',
        icon: 'i-heroicons-archive-box',
        extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst', 'ace', 'arj', 'cab', 'lzh', 'tgz']
    },
    document: {
        label: 'Document',
        icon: 'i-heroicons-document-text',
        extensions: ['pdf', 'epub', 'mobi', 'azw3', 'djvu', 'doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp', 'cbr', 'cbz', 'chm']
    },
    program: {
        label: 'Program',
        icon: 'i-heroicons-cog-6-tooth',
        extensions: ['exe', 'msi', 'apk', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'jar', 'bat', 'sh', 'flatpak', 'snap']
    },
    disc: {
        label: 'Disc image',
        icon: 'i-heroicons-circle-stack',
        extensions: ['iso', 'img', 'nrg', 'mds', 'mdf', 'cue', 'bin', 'cso', 'wim', 'vdi', 'vmdk', 'qcow2']
    },
    other: {
        label: 'Other',
        icon: 'i-heroicons-document',
        extensions: []
    }
};

/** Built once: a hundred rows each doing a linear scan of eight lists adds up. */
const KIND_BY_EXTENSION = new Map<string, FileKind>(
    (Object.entries(FILE_KINDS) as Array<[FileKind, KindDefinition]>)
        .flatMap(([kind, definition]) => definition.extensions.map(extension => [extension, kind] as const))
);

/**
 * The extension of a file name, lower case and without the dot.
 *
 * Empty when there is nothing that looks like one: a name with no dot, a dot at
 * the very end, a leading dot with nothing before it, or a "." inside what is
 * plainly not an extension ("Season 1 - 1080p" has no extension, and neither
 * does "www.example.com").
 */
export function fileExtension(fileName: string): string {
    const name = (fileName || '').trim();
    const dot = name.lastIndexOf('.');

    if (dot <= 0 || dot === name.length - 1) return '';

    const extension = name.slice(dot + 1).toLowerCase();
    return /^[a-z0-9]{1,5}$/.test(extension) ? extension : '';
}

export function fileKind(fileName: string): FileKind {
    return KIND_BY_EXTENSION.get(fileExtension(fileName)) ?? 'other';
}

export function fileKindIcon(fileName: string): string {
    return FILE_KINDS[fileKind(fileName)].icon;
}

export function fileKindLabel(fileName: string): string {
    return FILE_KINDS[fileKind(fileName)].label;
}

/**
 * The ed2k link for a file, which is nothing more than its name, size and hash.
 *
 * Search results arrive without one, and a link is what the rest of the app deals
 * in: it is what gets copied, pasted, shared and handed to `addLinks`. The name is
 * percent-encoded the way aMule writes them, so a link with a space or a "|" in
 * the name survives a round trip.
 */
export function buildEd2kLink(fileName: string, size: number, hash: string): string {
    if (!hash || !Number.isFinite(size) || size <= 0) return '';

    // aMule encodes exactly the characters that would otherwise break the link's
    // own "|" separated syntax, and leaves the rest readable.
    const name = (fileName || 'unknown')
        .replace(/%/g, '%25')
        .replace(/\|/g, '%7C')
        .replace(/\r?\n/g, ' ');

    return `ed2k://|file|${name}|${Math.round(size)}|${hash.toLowerCase()}|/`;
}
