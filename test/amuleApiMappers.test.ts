import { describe, it, expect } from 'vitest';
import {
    apiDownloadStatus,
    apiPriority,
    apiSoftwareLabel,
    apiToDownload,
    apiToPreferences,
    apiToSearchResult,
    apiToServer,
    apiToSharedFile,
    apiToStatus,
    apiToUpload
} from '../server/utils/amule-api/mappers';
import { buildStatsTreeFromApi } from '../server/utils/amule-ec/statsTree';
import { readAmuleFigures } from '../shared/utils/statsFigures';
import downloads from './fixtures/amuleapi/downloads.json';
import detail from './fixtures/amuleapi/download-detail.json';
import paused from './fixtures/amuleapi/download-after-pause.json';
import status from './fixtures/amuleapi/status.json';
import kadStatus from './fixtures/amuleapi/status-kad-started.json';
import shared from './fixtures/amuleapi/shared.json';
import sharedDetail from './fixtures/amuleapi/shared-detail.json';
import servers from './fixtures/amuleapi/servers.json';
import preferences from './fixtures/amuleapi/preferences.json';
import statsTree from './fixtures/amuleapi/stats-tree.json';

/**
 * amuleapi -> app types. The fixtures are real responses from an aMule 3.1.0
 * amuleapi; the app's types were shaped by EC, so the assertions are about a
 * row reading the same whichever link produced it.
 */

describe('apiToDownload', () => {
    it('maps a queue entry to the EC-shaped Download', () => {
        const download = apiToDownload(downloads.downloads[1] as any);

        expect(download).toMatchObject({
            hash: '0123456789abcdef0123456789abcdef',
            name: 'rig-test-one.iso',
            size: 734003200,
            sizeDone: 0,
            // amuleapi said "downloading" with nobody transferring - EC says Waiting
            status: 'Waiting',
            // auto priority reports the derived level plus the flag
            priority: 'Auto',
            autoPriority: true,
            speed: 0,
            sources: 0,
            percentComplete: 0,
            totalParts: 76,
            stopped: false
        });
        expect(download.ed2kLink).toMatch(/^ed2k:\/\/\|file\|rig-test-one\.iso\|/);
        // The list carries no part map and no detail fields
        expect(download.parts).toBeUndefined();
        expect(download).not.toHaveProperty('remainingSeconds');
    });

    it('carries the part map and detail fields from the detail view', () => {
        const download = apiToDownload(detail as any);

        expect(download.parts).toHaveLength(76);
        expect(download.parts![0]).toEqual({ state: 'unavailable', sources: 0 });
        expect(download).toMatchObject({
            remainingSeconds: null,
            directory: '/root/amule310/dl/temp',
            partFileName: '001.part',
            aichHash: null,
            media: null,
            lastReceived: 0,
            lastSeenComplete: 0
        });
    });

    it('reads a paused file as Paused', () => {
        expect(apiToDownload(paused as any).status).toBe('Paused');
    });

    it('splits every amuleapi status onto the six the UI knows', () => {
        expect(apiDownloadStatus('downloading', 3)).toBe('Downloading');
        expect(apiDownloadStatus('waiting', 0)).toBe('Waiting');
        expect(apiDownloadStatus('hashing', 0)).toBe('Hashing');
        expect(apiDownloadStatus('stopped', 0)).toBe('Paused');
        expect(apiDownloadStatus('completing', 0)).toBe('Complete');
        expect(apiDownloadStatus('completed', 0)).toBe('Complete');
        expect(apiDownloadStatus('insufficient_disk', 0)).toBe('Error');
        expect(apiDownloadStatus('erroneous', 0)).toBe('Error');
        // A token a newer amuleapi adds must not break the row
        expect(apiDownloadStatus('something_new', 1)).toBe('Downloading');
    });

    it('marks a stopped file as stopped', () => {
        const stopped = apiToDownload({ ...(downloads.downloads[0] as any), status: 'stopped' });
        expect(stopped).toMatchObject({ status: 'Paused', stopped: true });
    });
});

describe('apiPriority', () => {
    it('folds the upload-only levels the way the EC client does', () => {
        expect(apiPriority('very_low', false)).toBe('Low');
        expect(apiPriority('release', false)).toBe('High');
        expect(apiPriority('normal', false)).toBe('Normal');
        expect(apiPriority('high', true)).toBe('Auto');
    });
});

describe('apiToStatus', () => {
    it('reads an offline daemon as connected but on no network', () => {
        expect(apiToStatus(status as any)).toMatchObject({
            connected: true,
            ed2kConnected: false,
            ed2kConnecting: false,
            kadConnected: false,
            kadRunning: false,
            kadFirewalled: false,
            serverName: '',
            id: '',
            uploadSpeed: 0,
            downloadSpeed: 0,
            tempFreeBytes: 1006472822784
        });
    });

    it('sees Kad running while it is still connecting', () => {
        const result = apiToStatus(kadStatus as any);
        expect(result.kadRunning).toBe(true);
    });

    it('converts byte rates to the KB/s the EC client reports', () => {
        const busy = { ...(status as any), speeds: { ...status.speeds, download_speed_bytes_per_second: 2048, upload_speed_bytes_per_second: 512 } };
        expect(apiToStatus(busy)).toMatchObject({ downloadSpeed: 2, uploadSpeed: 0.5 });
    });
});

describe('apiToSharedFile', () => {
    it('maps the list entry, leaving detail-only fields at their EC defaults', () => {
        const file = apiToSharedFile(shared.shared[0] as any);

        expect(file).toMatchObject({
            fileName: 'rig-shared-sample.bin',
            hash: '5b594405444067f5eb0c8b3d0d3af141',
            size: 20971520,
            fullPath: '',
            onQueue: 0,
            comment: '',
            priority: 'Auto',
            uploadingClients: 0,
            lastUploadAt: null,
            sharedSince: 1791077794,
            media: null
        });
    });

    it('builds the full path and part availability from the detail view', () => {
        const file = apiToSharedFile(sharedDetail as any);

        expect(file.fullPath).toBe(`${sharedDetail.directory}/rig-shared-sample.bin`);
        expect(file.partSources).toHaveLength(sharedDetail.total_part_count);
    });
});

describe('apiToServer', () => {
    it('maps the server row', () => {
        expect(apiToServer(servers.servers[0] as any)).toMatchObject({
            name: 'rig test server',
            ip: '176.123.5.89',
            port: 4725,
            priority: 'Normal',
            static: false,
            failed: 0,
            version: null
        });
    });
});

describe('apiToUpload', () => {
    it('names the client software the way EC formats it', () => {
        expect(apiSoftwareLabel('emule', '0.50a')).toBe('eMule v0.50a');
        expect(apiSoftwareLabel('amule', null)).toBe('aMule');
        expect(apiSoftwareLabel('unknown', null)).toBe('');
    });

    it('maps an uploading client', () => {
        const upload = apiToUpload({
            ecid: 4382,
            name: 'AnonymousPeer',
            ip: '203.0.113.42',
            country_code: 'de',
            port: 4662,
            software: 'emule',
            software_version: '0.50a',
            upload_file_name: 'example.iso',
            upload_file_hash: '8B54A3C20FAE9E4B9F7E0C2C8C01B6B1',
            uploaded_bytes_session: 22000000,
            uploaded_bytes_total: 452000000,
            downloaded_bytes_total: 189000000,
            upload_speed_bytes_per_second: 22528,
            upload_queue_position: 0,
            upload_queue_score: 150
        });

        expect(upload).toMatchObject({
            fileName: 'example.iso',
            user: 'AnonymousPeer',
            speed: 22,
            userIp: '203.0.113.42',
            clientSoftware: 'eMule v0.50a',
            fileHash: '8b54a3c20fae9e4b9f7e0c2c8c01b6b1',
            countryCode: 'de'
        });
    });
});

describe('apiToPreferences', () => {
    it('maps the editable subset', () => {
        const prefs = apiToPreferences(preferences as any);

        expect(prefs.connection.tcpPort).toBe(preferences.connection.tcp_port);
        expect(prefs.connection.maxUpload).toBe(preferences.connection.max_upload_kibibytes_per_second);
        expect(prefs.directories.incoming).toBe(preferences.directories.incoming_path);
        expect(prefs.servers.removeDead).toBe(true);
        // amuleapi does not expose the graph capacities
        expect(prefs.connection.uploadCapacity).toBeUndefined();
    });
});

describe('apiToSearchResult', () => {
    it('keeps the extras EC search results cannot carry', () => {
        const result = apiToSearchResult({
            hash: '8B54A3C20FAE9E4B9F7E0C2C8C01B6B1',
            name: 'Example.Movie.2026.mkv',
            size_bytes: 3825205248,
            sources: { total: 217, complete: 142 },
            already_downloaded: true,
            rating: 4,
            media: { duration_seconds: 5400, codec: 'H.264', artist: '', album: '', title: '' }
        }, 3);

        expect(result).toMatchObject({
            resultNumber: 3,
            hash: '8b54a3c20fae9e4b9f7e0c2c8c01b6b1',
            sources: 217,
            completeSources: 142,
            alreadyDownloaded: true,
            rating: 4,
            fileType: 'video',
            extension: 'mkv',
            media: { durationSeconds: 5400, codec: 'H.264' }
        });
        expect(result.ed2kLink).toBe('ed2k://|file|Example.Movie.2026.mkv|3825205248|8b54a3c20fae9e4b9f7e0c2c8c01b6b1|/');
    });
});

describe('buildStatsTreeFromApi', () => {
    it('formats the tree so the statistics page reads the same figures as over EC', () => {
        const tree = buildStatsTreeFromApi(statsTree.nodes as any);
        const figures = readAmuleFigures(tree);

        expect(tree?.children.length).toBe(statsTree.nodes.length);
        expect(figures.uploaded).toEqual({ session: '0 bytes', total: '0 bytes' });
        expect(figures.sharedFiles).toBe('1');
        expect(figures.sharedSize).toBe('20.00 MB');
        expect(figures.uptime).toMatch(/^\d+m \d+s$/);
        expect(figures.knownClients).toBeDefined();
    });

    it('answers null for an empty tree', () => {
        expect(buildStatsTreeFromApi([])).toBe(null);
    });
});
