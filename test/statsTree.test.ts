import { describe, it, expect } from 'vitest';
import { buildStatsTree } from '../server/utils/amule-ec/statsTree';
import { ECStatValueType, ECTagNames } from '../server/utils/amule-ec/lib/AMuleProtocol';

const NODE = ECTagNames.EC_TAG_STATTREE_NODE;
const VALUE = ECTagNames.EC_TAG_STAT_NODE_VALUE;
const TYPE = ECTagNames.EC_TAG_STAT_VALUE_TYPE;

/** Helper mirroring the tag shape AMuleProtocol produces. */
const value = (raw: unknown, type: number, nested?: any) => ({
    nameEcTag: VALUE,
    value: raw,
    children: [
        { nameEcTag: TYPE, value: type, children: [] },
        ...(nested ? [nested] : [])
    ]
});

const node = (label: string, children: any[] = []) => ({ nameEcTag: NODE, value: label, children });

describe('buildStatsTree', () => {
    it('returns null without a node', () => {
        expect(buildStatsTree(null)).toBeNull();
        expect(buildStatsTree(undefined)).toBeNull();
    });

    it('substitutes a time value into the label placeholder', () => {
        const tree = buildStatsTree(node('Uptime: %s', [value(3661, ECStatValueType.EC_VALUE_TIME)]));
        expect(tree?.label).toBe('Uptime: 1h 1m');
    });

    it('formats byte and speed values', () => {
        expect(buildStatsTree(node('Sent: %s', [value(1536, ECStatValueType.EC_VALUE_BYTES)]))?.label)
            .toBe('Sent: 1.50 KB');
        expect(buildStatsTree(node('Rate: %s', [value(2048, ECStatValueType.EC_VALUE_SPEED)]))?.label)
            .toBe('Rate: 2.00 KB/s');
    });

    it('formats integers, short numbers, strings and percentages', () => {
        expect(buildStatsTree(node('Files: %u', [value(42, ECStatValueType.EC_VALUE_INTEGER)]))?.label)
            .toBe('Files: 42');
        expect(buildStatsTree(node('Clients: %s', [value(12_345, ECStatValueType.EC_VALUE_ISHORT)]))?.label)
            .toBe('Clients: 12.35k');
        expect(buildStatsTree(node('Version: %s', [value('2.3.3', ECStatValueType.EC_VALUE_STRING)]))?.label)
            .toBe('Version: 2.3.3');
        expect(buildStatsTree(node('Share: %.2f%%', [value(12.345, ECStatValueType.EC_VALUE_DOUBLE)]))?.label)
            .toBe('Share: 12.35%');
    });

    it('renders a nested value in parentheses, like aMule does', () => {
        const nested = value(25, ECStatValueType.EC_VALUE_INTEGER);
        const tree = buildStatsTree(node('Sessions: %s', [value(100, ECStatValueType.EC_VALUE_INTEGER, nested)]));
        expect(tree?.label).toBe('Sessions: 100 (25)');
    });

    it('appends values when the label carries no placeholder', () => {
        const tree = buildStatsTree(node('Total', [value(7, ECStatValueType.EC_VALUE_INTEGER)]));
        expect(tree?.label).toBe('Total: 7');
    });

    it('keeps the child hierarchy and ignores unrelated tags', () => {
        const tree = buildStatsTree(node('Statistics', [
            { nameEcTag: TYPE, value: 1, children: [] },
            node('Transfer', [node('Uploads: %u', [value(3, ECStatValueType.EC_VALUE_INTEGER)])]),
            node('Connection')
        ]));

        expect(tree?.label).toBe('Statistics');
        expect(tree?.children.map(child => child.label)).toEqual(['Transfer', 'Connection']);
        expect(tree?.children[0]?.children[0]?.label).toBe('Uploads: 3');
    });
});
