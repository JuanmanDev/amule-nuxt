/**
 * Formatting helpers shared by every page, so byte and speed values are
 * rendered identically everywhere.
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/** Formats a byte count, e.g. 1536 -> "1.50 KB". */
export function formatBytes(bytes: number | undefined | null, fractionDigits = 2): string {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '0 B';

    let unitIndex = 0;
    let scaled = value;
    while (scaled >= 1024 && unitIndex < UNITS.length - 1) {
        scaled /= 1024;
        unitIndex++;
    }

    return unitIndex === 0
        ? `${Math.round(scaled)} ${UNITS[0]}`
        : `${scaled.toFixed(fractionDigits)} ${UNITS[unitIndex]}`;
}

/** Formats a speed given in KB/s (the unit the EC client normalises to). */
export function formatSpeed(kbPerSecond: number | undefined | null): string {
    const value = Number(kbPerSecond);
    if (!Number.isFinite(value) || value <= 0) return '0 KB/s';

    return value >= 1024
        ? `${(value / 1024).toFixed(2)} MB/s`
        : `${value.toFixed(2)} KB/s`;
}

/** Formats a speed given in bytes/s (what the statistics endpoint reports). */
export function formatBytesPerSecond(bytesPerSecond: number | undefined | null): string {
    const value = Number(bytesPerSecond);
    if (!Number.isFinite(value) || value <= 0) return '0 B/s';

    return `${formatBytes(value)}/s`;
}

/** Formats a Unix timestamp in seconds; returns "Never" for 0 / missing values. */
export function formatTimestamp(unixSeconds: number | undefined | null): string {
    const value = Number(unixSeconds);
    if (!Number.isFinite(value) || value <= 0) return 'Never';

    return new Date(value * 1000).toLocaleString();
}

/** Formats a percentage with two decimals, clamped to 0..100. */
export function formatPercent(percent: number | undefined | null): string {
    const value = Number(percent);
    if (!Number.isFinite(value)) return '0.00%';

    return `${Math.min(100, Math.max(0, value)).toFixed(2)}%`;
}

/**
 * Remaining time for a download, or null when it cannot be estimated
 * (paused, no speed, or unknown size).
 */
export function formatEta(remainingBytes: number, kbPerSecond: number): string | null {
    if (!(remainingBytes > 0) || !(kbPerSecond > 0)) return null;

    const seconds = remainingBytes / (kbPerSecond * 1024);
    if (!Number.isFinite(seconds)) return null;

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${Math.floor(seconds % 60)}s`;
    return `${Math.max(1, Math.floor(seconds))}s`;
}
