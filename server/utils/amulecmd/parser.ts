/**
 * Output Parser Utilities for amulecmd
 * Parses text output from amulecmd into structured TypeScript objects
 */

import type {
    Download,
    Upload,
    Server,
    SearchResult,
    StatusResult,
    Statistics,
    BandwidthLimits,
    DownloadPriority,
    DownloadStatus
} from './types';
import { AmuleParseError } from './types';

/**
 * Parse status output from 'status' command
 */
export function parseStatus(output: string): StatusResult {
    try {
        const status: StatusResult = {
            connected: false,
            ed2kConnected: false,
            kadConnected: false,
            uploadSpeed: 0,
            downloadSpeed: 0,
            queuedClients: 0,
            totalSourceCount: 0
        };

        // Parse connection status
        if (output.includes('eD2k: Connected')) {
            status.ed2kConnected = true;
            status.connected = true;
        }
        if (output.includes('Kad: Connected')) {
            status.kadConnected = true;
            status.connected = true;
        }

        // Parse server info
        const serverMatch = output.match(/Connected to:\s+(.+?)\s+\((.+?)\)/);
        if (serverMatch) {
            status.serverName = serverMatch[1];
            status.serverIP = serverMatch[2];
        }

        // Parse ID
        const idMatch = output.match(/ID:\s+(\d+)/);
        if (idMatch) {
            status.id = idMatch[1];
        }

        // Parse speeds (format: "Upload: 12.3 kB/s")
        const uploadMatch = output.match(/Upload:\s+([\d.]+)\s+kB\/s/);
        if (uploadMatch) {
            status.uploadSpeed = parseFloat(uploadMatch[1]);
        }

        const downloadMatch = output.match(/Download:\s+([\d.]+)\s+kB\/s/);
        if (downloadMatch) {
            status.downloadSpeed = parseFloat(downloadMatch[1]);
        }

        // Parse clients
        const clientsMatch = output.match(/Clients in queue:\s+(\d+)/);
        if (clientsMatch) {
            status.queuedClients = parseInt(clientsMatch[1], 10);
        }

        const sourcesMatch = output.match(/Total sources:\s+(\d+)/);
        if (sourcesMatch) {
            status.totalSourceCount = parseInt(sourcesMatch[1], 10);
        }

        return status;
    } catch (error) {
        throw new AmuleParseError('Failed to parse status output', output);
    }
}

/**
 * Parse download queue from 'show dl' command
 */
export function parseDownloads(output: string): Download[] {
    try {
        const downloads: Download[] = [];
        const lines = output.split('\n');

        // Parse each download entry
        // Format: " > HASH Filename"
        //         " >       [progress%]    sources     (priority) - Status - partfile - Priority [Speed] - download_rate"
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Look for lines starting with ">" that contain a hash (32 hex chars) and filename
            if (line.startsWith('>') && /^>\s+[A-F0-9]{32}\s/.test(line)) {
                // Extract hash and filename from first line
                const match = line.match(/^>\s+([A-F0-9]{32})\s+(.+)$/);
                if (!match) continue;

                const [, hash, name] = match;

                // Check next line for details
                const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';

                let percentComplete = 0;
                let sources = 0;
                let status: DownloadStatus = 'Waiting';
                let priority: DownloadPriority = 'Normal';
                let speed = 0;

                if (nextLine.startsWith('>')) {
                    // Parse details line: " >       [0.1%]    8/  12     (02) - Downloading - 001.part.met - Auto [Hi] - 78.75 kB/s"
                    const detailsMatch = nextLine.match(/>\s+\[([0-9.]+)%\]\s+(\d+)\/\s*(\d+)\s+\((\d+)\)\s+-\s+(\w+)\s+-\s+(.+?)\s+-\s+(\w+)\s+\[(\w+)\]\s+-\s+([0-9.]+)\s+(\w+)\/s/);

                    if (detailsMatch) {
                        percentComplete = parseFloat(detailsMatch[1]);
                        const currentSources = parseInt(detailsMatch[2], 10);
                        const totalSources = parseInt(detailsMatch[3], 10);
                        sources = totalSources;
                        status = detailsMatch[5] as DownloadStatus;
                        priority = detailsMatch[8] as DownloadPriority;

                        // Parse speed
                        const speedValue = parseFloat(detailsMatch[9]);
                        const speedUnit = detailsMatch[10];

                        // Convert to bytes/sec
                        if (speedUnit === 'kB') {
                            speed = speedValue * 1024;
                        } else if (speedUnit === 'MB') {
                            speed = speedValue * 1024 * 1024;
                        } else {
                            speed = speedValue;
                        }
                    }

                    i++; // Skip the details line
                }

                downloads.push({
                    hash,
                    name: name.trim(),
                    size: 0, // Size not directly available in minimal output
                    sizeDone: 0,
                    status,
                    priority,
                    speed,
                    sources,
                    sourcesNotCurrent: 0,
                    sourcesA4AF: 0,
                    sourcesXfer: 0,
                    percentComplete
                });
            }
        }

        return downloads;
    } catch (error) {
        throw new AmuleParseError('Failed to parse downloads output', output);
    }
}

/**
 * Parse upload queue from 'show ul' command
 */
export function parseUploads(output: string): Upload[] {
    try {
        const uploads: Upload[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('---') || trimmed.startsWith('Upload')) {
                continue;
            }

            // Simple parsing - format may vary
            const match = trimmed.match(/(.+?)\s+-\>\s+(.+?)\s+([\d.]+)\s+kB\/s\s+(.+)/);
            if (match) {
                const [, fileName, user, speed] = match;
                uploads.push({
                    fileName: fileName.trim(),
                    user: user.trim(),
                    speed: parseFloat(speed),
                    transferred: 0 // May need additional parsing
                });
            }
        }

        return uploads;
    } catch (error) {
        throw new AmuleParseError('Failed to parse uploads output', output);
    }
}

/**
 * Parse server list from 'show servers' command
 */
export function parseServers(output: string): Server[] {
    try {
        const servers: Server[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('---') || trimmed.startsWith('Server')) {
                continue;
            }

            // Parse server entry
            const match = trimmed.match(/(.+?)\s+(\d+\.\d+\.\d+\.\d+):(\d+)\s+(.+?)\s+U:(\d+)\s+F:(\d+)/);
            if (match) {
                const [, name, ip, port, description, users, files] = match;
                servers.push({
                    name: name.trim(),
                    ip,
                    port: parseInt(port, 10),
                    description: description.trim(),
                    users: parseInt(users, 10),
                    files: parseInt(files, 10),
                    priority: 'Normal',
                    failed: 0,
                    static: false
                });
            }
        }

        return servers;
    } catch (error) {
        throw new AmuleParseError('Failed to parse servers output', output);
    }
}

/**
 * Parse search results from 'results' command
 */
export function parseSearchResults(output: string): SearchResult[] {
    try {
        const results: SearchResult[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('---') || trimmed.startsWith('Search')) {
                continue;
            }

            // Format: "[N] filename size sources hash"
            const match = trimmed.match(/\[(\d+)\]\s+(.+?)\s+([\d.]+)\s+(\w+)\s+(\d+)\s+sources?\s+([a-fA-F0-9]+)/);
            if (match) {
                const [, number, fileName, sizeValue, sizeUnit, sources, hash] = match;

                // Convert size to bytes
                let size = parseFloat(sizeValue);
                if (sizeUnit.toLowerCase().includes('mb')) size *= 1024 * 1024;
                else if (sizeUnit.toLowerCase().includes('gb')) size *= 1024 * 1024 * 1024;
                else if (sizeUnit.toLowerCase().includes('kb')) size *= 1024;

                results.push({
                    resultNumber: parseInt(number, 10),
                    hash,
                    fileName: fileName.trim(),
                    size,
                    sources: parseInt(sources, 10)
                });
            }
        }

        return results;
    } catch (error) {
        throw new AmuleParseError('Failed to parse search results output', output);
    }
}

/**
 * Parse statistics from 'statistics' command
 */
export function parseStatistics(output: string): Statistics {
    try {
        const stats: Statistics = {
            uptime: 0,
            totalUploaded: 0,
            totalDownloaded: 0,
            sessionUploaded: 0,
            sessionDownloaded: 0,
            uploadRate: 0,
            downloadRate: 0,
            connectedClients: 0,
            totalClients: 0,
            sharedFiles: 0
        };

        // Parse uptime
        const uptimeMatch = output.match(/Uptime:\s+([\d:]+)/);
        if (uptimeMatch) {
            // Convert HH:MM:SS to seconds
            const parts = uptimeMatch[1].split(':');
            stats.uptime = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        }

        // Parse upload/download totals
        const totalUpMatch = output.match(/Total uploaded:\s+([\d.]+)\s+(\w+)/);
        if (totalUpMatch) {
            stats.totalUploaded = parseDataSize(totalUpMatch[1], totalUpMatch[2]);
        }

        const totalDownMatch = output.match(/Total downloaded:\s+([\d.]+)\s+(\w+)/);
        if (totalDownMatch) {
            stats.totalDownloaded = parseDataSize(totalDownMatch[1], totalDownMatch[2]);
        }

        // Parse session stats
        const sessionUpMatch = output.match(/Session uploaded:\s+([\d.]+)\s+(\w+)/);
        if (sessionUpMatch) {
            stats.sessionUploaded = parseDataSize(sessionUpMatch[1], sessionUpMatch[2]);
        }

        const sessionDownMatch = output.match(/Session downloaded:\s+([\d.]+)\s+(\w+)/);
        if (sessionDownMatch) {
            stats.sessionDownloaded = parseDataSize(sessionDownMatch[1], sessionDownMatch[2]);
        }

        return stats;
    } catch (error) {
        throw new AmuleParseError('Failed to parse statistics output', output);
    }
}

/**
 * Parse bandwidth limits from 'get bwlimits' command
 */
export function parseBandwidthLimits(output: string): BandwidthLimits {
    try {
        const limits: BandwidthLimits = {
            uploadLimit: 0,
            downloadLimit: 0
        };

        const upMatch = output.match(/Upload limit:\s+([\d.]+)/);
        if (upMatch) {
            limits.uploadLimit = parseFloat(upMatch[1]);
        }

        const downMatch = output.match(/Download limit:\s+([\d.]+)/);
        if (downMatch) {
            limits.downloadLimit = parseFloat(downMatch[1]);
        }

        return limits;
    } catch (error) {
        throw new AmuleParseError('Failed to parse bandwidth limits output', output);
    }
}

/**
 * Helper: Convert data size string to bytes
 */
function parseDataSize(value: string, unit: string): number {
    const numValue = parseFloat(value);
    const unitLower = unit.toLowerCase();

    if (unitLower.includes('gb')) return numValue * 1024 * 1024 * 1024;
    if (unitLower.includes('mb')) return numValue * 1024 * 1024;
    if (unitLower.includes('kb')) return numValue * 1024;
    return numValue;
}

/**
 * Simple success/error parser for commands that return simple responses
 */
export function parseSimpleResponse(output: string): { success: boolean; message: string } {
    const lines = output.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    // Check for success/error indicators
    const hasError = output.toLowerCase().includes('error') ||
        output.toLowerCase().includes('failed');

    let message = '';

    if (hasError) {
        // Extract the error message - look for lines starting with ">" or containing "error"/"failed"
        const errorLine = lines.find(line =>
            line.toLowerCase().includes('error') ||
            line.toLowerCase().includes('failed') ||
            (line.startsWith('>') && !line.includes('Connection established'))
        );

        if (errorLine) {
            // Clean up the message - remove ">" prefix and extra whitespace
            message = errorLine.replace(/^>\s*/, '').replace(/Request failed with the following error:\s*/i, '').trim();
        } else {
            message = 'Operation failed';
        }
    } else {
        // For success, look for "Operation was successful" or similar
        const successLine = lines.find(line =>
            line.toLowerCase().includes('successful') ||
            line.toLowerCase().includes('connected') ||
            line.startsWith('>')
        );

        if (successLine) {
            message = successLine.replace(/^>\s*/, '').trim();
        } else {
            message = 'Operation completed successfully';
        }
    }

    return {
        success: !hasError,
        message
    };
}
