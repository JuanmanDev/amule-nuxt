/**
 * AmuleCmdClient - TypeScript API Wrapper for amulecmd
 * 
 * SOLID Principles:
 * - Single Responsibility: Manages only amulecmd communication
 * - Open/Closed: Extensible for new commands without modification
 * - Liskov Substitution: Implements ICommandExecutor interface
 * - Interface Segregation: Separate methods for different operations
 * - Dependency Inversion: Depends on abstractions (config interface)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type {
    AmuleConfig,
    CommandResult,
    StatusResult,
    Download,
    Upload,
    Server,
    SearchResult,
    ProgressResult,
    Statistics,
    BandwidthLimits,
    IPFilterConfig,
    SearchType,
    DownloadPriority
} from './types';
import {
    AmuleConnectionError,
    AmuleCommandError,
    AmuleTimeoutError
} from './types';
import {
    parseStatus,
    parseDownloads,
    parseUploads,
    parseServers,
    parseSearchResults,
    parseStatistics,
    parseBandwidthLimits,
    parseSimpleResponse
} from './parser';

const execAsync = promisify(exec);

export class AmuleCmdClient {
    private config: AmuleConfig;
    private commandTimeout: number = 30000; // 30 seconds default

    constructor(config: AmuleConfig) {
        this.config = {
            host: config.host,
            port: config.port.toString(),
            password: config.password,
            executablePath: config.executablePath || 'amulecmd'
        };
    }

    /**
     * Execute a raw amulecmd command
     * @private
     */
    private async executeCommand(command: string): Promise<string> {
        const { host, port, password, executablePath } = this.config;

        let finalExecutable = executablePath;

        // If executablePath is just 'amulecmd', use absolute path to avoid PATH issues
        if (executablePath === 'amulecmd') {
            if (process.platform === 'win32') {
                // Running on Windows, need to call into WSL
                finalExecutable = 'wsl /usr/bin/amulecmd';
            } else {
                // Running in Linux/WSL, use absolute path
                finalExecutable = '/usr/bin/amulecmd';
            }
        }

        // Build amulecmd command
        const cmdLine = `${finalExecutable} -h ${host} -p ${port} -P "${password}" -c "${command}"`;

        try {
            const { stdout, stderr } = await Promise.race([
                execAsync(cmdLine, {
                    timeout: this.commandTimeout,
                    maxBuffer: 1024 * 1024 * 10 // 10MB buffer for large outputs
                }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new AmuleTimeoutError(command, this.commandTimeout)), this.commandTimeout)
                )
            ]);

            if (stderr && stderr.toLowerCase().includes('error')) {
                throw new AmuleCommandError(command, stderr);
            }

            return stdout;
        } catch (error: any) {
            if (error instanceof AmuleTimeoutError) {
                throw error;
            }

            if (error.code === 'ENOENT' || error.message?.includes('not recognized')) {
                throw new AmuleConnectionError('amulecmd command not found. Is aMule installed?');
            }

            if (error.message?.includes('Connection refused') || error.message?.includes('authentication')) {
                throw new AmuleConnectionError('Cannot connect to aMule daemon. Check host, port, and password.');
            }

            throw new AmuleCommandError(command, error.message || 'Unknown error');
        }
    }

    // ========== Connection Management ==========

    /**
     * Connect to network(s)
     * @param network - Optional: 'kad', 'ed2k', or server IP:Port
     */
    async connect(network?: 'kad' | 'ed2k' | string): Promise<CommandResult> {
        const command = network ? `connect ${network}` : 'connect';
        const output = await this.executeCommand(command);
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message
        };
    }

    /**
     * Disconnect from network(s)
     * @param network - Optional: 'kad' or 'ed2k'
     */
    async disconnect(network?: 'kad' | 'ed2k'): Promise<CommandResult> {
        const command = network ? `disconnect ${network}` : 'disconnect';
        const output = await this.executeCommand(command);
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message
        };
    }

    /**
     * Get current connection status
     */
    async status(): Promise<StatusResult> {
        const output = await this.executeCommand('status');
        return parseStatus(output);
    }

    // ========== Download Management ==========

    /**
     * Add a download link (eD2k or magnet)
     * @param link - eD2k link or magnet link
     */
    async addLink(link: string): Promise<CommandResult> {
        // Escape quotes in the link
        const escapedLink = link.replace(/"/g, '\\"');
        const output = await this.executeCommand(`add ${escapedLink}`);
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message,
            data: { link }
        };
    }

    /**
     * Cancel a download
     * @param hashOrNumber - File hash or download number
     */
    async cancel(hashOrNumber: string): Promise<CommandResult> {
        const output = await this.executeCommand(`cancel ${hashOrNumber}`);
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message
        };
    }

    /**
     * Pause a download
     * @param hashOrNumber - File hash or download number
     */
    async pause(hashOrNumber: string): Promise<CommandResult> {
        const output = await this.executeCommand(`pause ${hashOrNumber}`);
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message
        };
    }

    /**
     * Resume a paused download
     * @param hashOrNumber - File hash or download number
     */
    async resume(hashOrNumber: string): Promise<CommandResult> {
        const output = await this.executeCommand(`resume ${hashOrNumber}`);
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message
        };
    }

    /**
     * Set download priority
     * @param hashOrNumber - File hash or download number
     * @param priority - Priority level
     */
    async setPriority(hashOrNumber: string, priority: DownloadPriority): Promise<CommandResult> {
        const output = await this.executeCommand(`priority ${priority} ${hashOrNumber}`);
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message
        };
    }

    /**
     * Get download queue
     */
    async showDownloads(): Promise<Download[]> {
        const output = await this.executeCommand('show dl');
        return parseDownloads(output);
    }

    // ========== Search Operations ==========

    /**
     * Perform a search
     * @param type - Search type (Global, Kad, Local)
     * @param keyword - Search keyword
     */
    async search(type: SearchType, keyword: string): Promise<CommandResult> {
        const escapedKeyword = keyword.replace(/"/g, '\\"');
        const output = await this.executeCommand(`search ${type} "${escapedKeyword}"`);
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message,
            data: { type, keyword }
        };
    }

    /**
     * Get search results
     */
    async getSearchResults(): Promise<SearchResult[]> {
        const output = await this.executeCommand('results');
        return parseSearchResults(output);
    }

    /**
     * Get search progress
     */
    async getSearchProgress(): Promise<ProgressResult> {
        const output = await this.executeCommand('progress');

        // Simple parsing for progress
        const progressMatch = output.match(/(\d+)%/);
        const resultsMatch = output.match(/(\d+)\s+results/);

        return {
            searchProgress: progressMatch ? parseInt(progressMatch[1], 10) : 0,
            resultsCount: resultsMatch ? parseInt(resultsMatch[1], 10) : 0,
            searching: output.toLowerCase().includes('searching')
        };
    }

    /**
     * Download a file from search results
     * @param resultNumber - Result number from search
     */
    async download(resultNumber: number): Promise<CommandResult> {
        const output = await this.executeCommand(`download ${resultNumber}`);
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message
        };
    }

    // ========== Information Queries ==========

    /**
     * Get upload queue
     */
    async showUploads(): Promise<Upload[]> {
        const output = await this.executeCommand('show ul');
        return parseUploads(output);
    }

    /**
     * Get server list
     */
    async showServers(): Promise<Server[]> {
        const output = await this.executeCommand('show servers');
        return parseServers(output);
    }

    /**
     * Get log entries
     */
    async showLog(): Promise<string[]> {
        const output = await this.executeCommand('show log');
        return output.split('\n').filter(line => line.trim().length > 0);
    }

    /**
     * Get statistics
     */
    async getStatistics(): Promise<Statistics> {
        const output = await this.executeCommand('statistics');
        return parseStatistics(output);
    }

    // ========== Configuration ==========

    /**
     * Get bandwidth limits
     */
    async getBandwidthLimits(): Promise<BandwidthLimits> {
        const output = await this.executeCommand('get bwlimits');
        return parseBandwidthLimits(output);
    }

    /**
     * Set bandwidth limits
     * @param limits - Upload and download limits in KB/s (0 = unlimited)
     */
    async setBandwidthLimits(limits: BandwidthLimits): Promise<CommandResult> {
        const output = await this.executeCommand(`set bwlimits ${limits.uploadLimit} ${limits.downloadLimit}`);
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message,
            data: limits
        };
    }

    /**
     * Get IP filter configuration
     */
    async getIPFilter(): Promise<CommandResult> {
        const output = await this.executeCommand('get ipfilter');
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message,
            data: output
        };
    }

    /**
     * Reload a resource (e.g., shared files, IP filter)
     * @param what - What to reload
     */
    async reload(what: string): Promise<CommandResult> {
        const output = await this.executeCommand(`reload ${what}`);
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message
        };
    }

    // ========== System Control ==========

    /**
     * Shutdown aMule daemon
     */
    async shutdown(): Promise<CommandResult> {
        const output = await this.executeCommand('shutdown');
        const result = parseSimpleResponse(output);

        return {
            success: result.success,
            message: result.message
        };
    }

    /**
     * Exit amulecmd (client-side only, doesn't affect daemon)
     */
    async exit(): Promise<CommandResult> {
        // This is a client-side command, doesn't do anything in our implementation
        return {
            success: true,
            message: 'Client disconnected'
        };
    }

    /**
     * Get help text
     * @param command - Optional command to get help for
     */
    async help(command?: string): Promise<string> {
        const cmd = command ? `help ${command}` : 'help';
        return await this.executeCommand(cmd);
    }

    // ========== Utility Methods ==========

    /**
     * Set command execution timeout
     * @param timeoutMs - Timeout in milliseconds
     */
    setTimeout(timeoutMs: number): void {
        this.commandTimeout = timeoutMs;
    }

    /**
     * Test connection to aMule daemon
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.status();
            return true;
        } catch (error) {
            return false;
        }
    }
}

/**
 * Factory function to create AmuleCmdClient with runtime config
 */
export function createAmuleClient(config: AmuleConfig): AmuleCmdClient {
    return new AmuleCmdClient(config);
}
