/**
 * Reads the interesting numbers out of aMule's statistics tree.
 *
 * The daemon already tracks session *and* all-time totals plus its own average
 * and maximum transfer rates, so the UI does not have to derive them from
 * samples it collected itself (which start empty on every restart).
 */

export interface StatsTreeLike {
    label: string;
    children: StatsTreeLike[];
}

export interface SessionTotal {
    /** Text as aMule formats it, e.g. "114.61 GB". */
    session: string;
    /** All-time value, when aMule reports one. */
    total?: string;
}

export interface AmuleFigures {
    uptime?: string;
    uploaded?: SessionTotal;
    downloaded?: SessionTotal;
    ratio?: SessionTotal;
    averageUpload?: string;
    averageDownload?: string;
    maxUpload?: string;
    maxDownload?: string;
    activeUploads?: string;
    waitingUploads?: string;
    activeDownloads?: string;
    foundSources?: string;
    uploadSessions?: string;
    averageUploadTime?: string;
    activeConnections?: string;
    peakConnections?: string;
    reconnects?: string;
    sharedFiles?: string;
    sharedSize?: string;
    averageFileSize?: string;
    workingServers?: string;
    totalServers?: string;
    knownClients?: string;
    bannedClients?: string;
    filteredClients?: string;
}

/** Depth-first walk over the tree. */
function* walk(node: StatsTreeLike | null | undefined): Generator<StatsTreeLike> {
    if (!node) return;
    yield node;
    for (const child of node.children) yield* walk(child);
}

/**
 * Value part of a "Label: value" line, taken after the matched prefix.
 * Splitting on the first colon would break labels that contain one, such as
 * "Session UL:DL Ratio (Total): 41.80 : 1".
 */
function valueAfterPrefix(label: string, prefix: string): string {
    const rest = label.slice(prefix.length);
    const separator = rest.indexOf(':');
    return (separator === -1 ? rest : rest.slice(separator + 1)).trim();
}

/** Finds the first entry whose label starts with `prefix` and returns its value. */
export function findStatValue(tree: StatsTreeLike | null | undefined, prefix: string): string | undefined {
    const needle = prefix.toLowerCase();
    for (const node of walk(tree)) {
        if (node.label.toLowerCase().startsWith(needle)) return valueAfterPrefix(node.label, prefix);
    }
    return undefined;
}

/**
 * Splits aMule's "session (total)" notation, e.g.
 * "114.61 GB (307.67 GB)" or "41.80 : 1 (77.00 : 1)".
 */
export function splitSessionTotal(value: string | undefined): SessionTotal | undefined {
    if (!value) return undefined;

    const match = value.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    return match
        ? { session: match[1]!.trim(), total: match[2]!.trim() }
        : { session: value.trim() };
}

/** Collects the figures the statistics page shows. */
export function readAmuleFigures(tree: StatsTreeLike | null | undefined): AmuleFigures {
    const get = (prefix: string) => findStatValue(tree, prefix);

    return {
        uptime: get('Uptime'),
        uploaded: splitSessionTotal(get('Uploaded Data')),
        downloaded: splitSessionTotal(get('Downloaded Data')),
        ratio: splitSessionTotal(get('Session UL:DL Ratio')),
        averageUpload: get('Average upload rate'),
        averageDownload: get('Average download rate'),
        maxUpload: get('Max upload rate'),
        maxDownload: get('Max download rate'),
        activeUploads: get('Active Uploads'),
        waitingUploads: get('Waiting Uploads'),
        activeDownloads: get('Active Downloads'),
        foundSources: get('Found Sources'),
        uploadSessions: get('Total successful upload sessions'),
        averageUploadTime: get('Average upload time'),
        activeConnections: get('Active Connections'),
        peakConnections: get('Peak Connections'),
        reconnects: get('Reconnects'),
        sharedFiles: get('Number of Shared Files'),
        sharedSize: get('Total size of Shared Files'),
        averageFileSize: get('Average file size'),
        workingServers: get('Working Servers'),
        totalServers: get('Total:'),
        knownClients: get('Total: '),
        bannedClients: get('Banned'),
        filteredClients: get('Filtered:')
    };
}
