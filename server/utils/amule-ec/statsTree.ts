/**
 * Formats aMule's statistics tree.
 *
 * Each node carries a label that may contain printf placeholders plus a list of
 * typed values (EC_TAG_STAT_NODE_VALUE). This mirrors
 * CEC_StatTree_Node_Tag::GetDisplayString() / FormatValue() in aMule so the UI
 * shows the same text aMule's own GUI would.
 */

import { ECStatValueType, ECTagNames } from './lib/AMuleProtocol';

export interface StatsTreeNode {
    label: string;
    children: StatsTreeNode[];
}

/** Minimal shape of a parsed EC tag, as produced by AMuleProtocol. */
interface RawTag {
    nameEcTag?: number;
    value?: unknown;
    children?: RawTag[];
}

const KB = 1024;

function formatBytes(bytes: number): string {
    const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= KB && unit < units.length - 1) {
        value /= KB;
        unit++;
    }
    return unit === 0 ? `${Math.round(value)} bytes` : `${value.toFixed(2)} ${units[unit]}`;
}

/** aMule's CastItoIShort: 1234 -> "1.23k". */
function formatShort(value: number): string {
    if (value < 1000) return String(value);
    if (value < 1_000_000) return `${(value / 1000).toFixed(2)}k`;
    if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    return `${(value / 1_000_000_000).toFixed(2)}G`;
}

/** aMule's CastSecondsToHM. */
function formatDuration(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
}

function formatStatValue(tag: RawTag): string {
    const type = Number(
        tag.children?.find(child => child.nameEcTag === ECTagNames.EC_TAG_STAT_VALUE_TYPE)?.value
        ?? ECStatValueType.EC_VALUE_INTEGER
    );

    // A nested value is rendered in parentheses after the main one. aMule prints a
    // nested double as a percentage, so it keeps its percent sign here.
    const nested = tag.children?.find(child => child.nameEcTag === ECTagNames.EC_TAG_STAT_NODE_VALUE);
    const nestedType = Number(
        nested?.children?.find(child => child.nameEcTag === ECTagNames.EC_TAG_STAT_VALUE_TYPE)?.value
        ?? ECStatValueType.EC_VALUE_INTEGER
    );
    const extra = nested
        ? ` (${formatStatValue(nested)}${nestedType === ECStatValueType.EC_VALUE_DOUBLE ? '%' : ''})`
        : '';

    const raw = tag.value;
    const numeric = Number(raw ?? 0);

    switch (type) {
        case ECStatValueType.EC_VALUE_BYTES:
            return formatBytes(numeric) + extra;
        case ECStatValueType.EC_VALUE_ISHORT:
            return formatShort(numeric) + extra;
        case ECStatValueType.EC_VALUE_TIME:
            return formatDuration(numeric) + extra;
        case ECStatValueType.EC_VALUE_SPEED:
            return `${formatBytes(numeric)}/s` + extra;
        case ECStatValueType.EC_VALUE_STRING:
            return `${raw ?? ''}${extra}`;
        case ECStatValueType.EC_VALUE_DOUBLE:
            // The label carries the unit (aMule uses "%.2f%%" where a percent is meant)
            return `${numeric.toFixed(2)}${extra}`;
        case ECStatValueType.EC_VALUE_ISTRING:
            return `${numeric}${extra}`;
        default:
            return `${numeric}${extra}`;
    }
}

/**
 * Replaces the printf placeholders aMule uses, one per value, in order.
 * aMule labels use %s, %u, %llu, %g, %.2f%% and friends.
 */
function applyLabelValues(label: string, values: string[]): string {
    if (values.length === 0) return label;

    let index = 0;
    const formatted = label.replace(/%[-+ 0#]?\d*(?:\.\d+)?(?:llu|lu|ll|[sudifxgGeE])(%%)?/g, (match, percent) => {
        if (index >= values.length) return match;
        const value = values[index++]!;
        // "%.2f%%" prints a literal percent sign after the number
        return percent ? `${value}%` : value;
    });

    // Labels without a placeholder (e.g. plain section titles) get the values appended
    return index === 0 ? `${label}: ${values.join(', ')}` : formatted;
}

/** Converts a raw EC statistics node into a display tree. */
export function buildStatsTree(node: RawTag | null | undefined): StatsTreeNode | null {
    if (!node) return null;

    const label = typeof node.value === 'string' ? node.value : '';
    const values = (node.children || [])
        .filter(child => child.nameEcTag === ECTagNames.EC_TAG_STAT_NODE_VALUE)
        .map(formatStatValue);

    const children = (node.children || [])
        .filter(child => child.nameEcTag === ECTagNames.EC_TAG_STATTREE_NODE)
        .map(buildStatsTree)
        .filter((child): child is StatsTreeNode => child !== null);

    return {
        label: applyLabelValues(label, values),
        children
    };
}
