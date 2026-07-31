import { describe, it, expect } from 'vitest';
import { findStatValue, readAmuleFigures, splitSessionTotal } from '../shared/utils/statsFigures';

const node = (label: string, children: any[] = []) => ({ label, children });

/** Shaped like the real tree the daemon returns. */
const tree = node('Statistics', [
    node('Uptime: 17h 49m'),
    node('Transfer', [
        node('Session UL:DL Ratio (Total): 41.80 : 1 (77.00 : 1)'),
        node('Uploads', [
            node('Uploaded Data (Session (Total)): 114.61 GB (307.67 GB)', [node('eMule: 85.50 GB')]),
            node('Active Uploads: 4'),
            node('Waiting Uploads: 0'),
            node('Total successful upload sessions: 273'),
            node('Average upload time: 7m 16s')
        ]),
        node('Downloads', [
            node('Downloaded Data (Session (Total)): 2.74 GB (2.74 GB)'),
            node('Found Sources: 0'),
            node('Active Downloads (chunks): 0')
        ])
    ]),
    node('Connection', [
        node('Average download rate (Session): 44.81 KB/s'),
        node('Average upload rate (Session): 1.83 MB/s'),
        node('Max download rate (Session): 26.50 MB/s'),
        node('Max upload rate (Session): 28.55 MB/s'),
        node('Reconnects: 0'),
        node('Active Connections (estimate): 4'),
        node('Peak Connections (estimate): 64')
    ]),
    node('Shared Files', [
        node('Number of Shared Files: 395'),
        node('Total size of Shared Files: 876.00 GB'),
        node('Average file size: 2.22 GB')
    ]),
    node('Servers', [node('Working Servers: 1')])
]);

describe('splitSessionTotal', () => {
    it('splits the session and total parts', () => {
        expect(splitSessionTotal('114.61 GB (307.67 GB)')).toEqual({ session: '114.61 GB', total: '307.67 GB' });
    });

    it('handles a ratio with colons', () => {
        expect(splitSessionTotal('41.80 : 1 (77.00 : 1)')).toEqual({ session: '41.80 : 1', total: '77.00 : 1' });
    });

    it('returns only a session value when aMule reports no total', () => {
        expect(splitSessionTotal('44.81 KB/s')).toEqual({ session: '44.81 KB/s' });
    });

    it('returns undefined for missing input', () => {
        expect(splitSessionTotal(undefined)).toBeUndefined();
    });
});

describe('findStatValue', () => {
    it('finds a nested entry and strips the label', () => {
        expect(findStatValue(tree, 'Average upload time')).toBe('7m 16s');
        expect(findStatValue(tree, 'Max download rate')).toBe('26.50 MB/s');
    });

    it('returns undefined when nothing matches', () => {
        expect(findStatValue(tree, 'Does not exist')).toBeUndefined();
        expect(findStatValue(null, 'Uptime')).toBeUndefined();
    });
});

describe('readAmuleFigures', () => {
    it('reads session and all-time transfer figures', () => {
        const figures = readAmuleFigures(tree);

        expect(figures.uptime).toBe('17h 49m');
        expect(figures.uploaded).toEqual({ session: '114.61 GB', total: '307.67 GB' });
        expect(figures.downloaded).toEqual({ session: '2.74 GB', total: '2.74 GB' });
        expect(figures.ratio).toEqual({ session: '41.80 : 1', total: '77.00 : 1' });
    });

    it('reads the rates aMule tracks itself, so the UI need not sample them', () => {
        const figures = readAmuleFigures(tree);

        expect(figures.maxUpload).toBe('28.55 MB/s');
        expect(figures.maxDownload).toBe('26.50 MB/s');
        expect(figures.averageUpload).toBe('1.83 MB/s');
        expect(figures.averageDownload).toBe('44.81 KB/s');
    });

    it('reads queue, connection and sharing figures', () => {
        const figures = readAmuleFigures(tree);

        expect(figures.activeUploads).toBe('4');
        expect(figures.waitingUploads).toBe('0');
        expect(figures.uploadSessions).toBe('273');
        expect(figures.foundSources).toBe('0');
        expect(figures.peakConnections).toBe('64');
        expect(figures.sharedFiles).toBe('395');
        expect(figures.sharedSize).toBe('876.00 GB');
        expect(figures.averageFileSize).toBe('2.22 GB');
        expect(figures.workingServers).toBe('1');
    });

    it('returns an empty object for an empty tree', () => {
        expect(readAmuleFigures(null).uptime).toBeUndefined();
    });
});
