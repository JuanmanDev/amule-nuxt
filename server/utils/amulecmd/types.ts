/**
 * TypeScript Type Definitions for aMule Command Client
 * Defines interfaces and types for all amulecmd operations
 */

// ========== Base Types ==========

export interface AmuleConfig {
    host: string;
    port: string | number;
    password: string;
    executablePath?: string;
}

export interface CommandResult {
    success: boolean;
    message: string;
    data?: any;
}

// ========== Connection & Status ==========

export interface StatusResult {
    connected: boolean;
    ed2kConnected: boolean;
    kadConnected: boolean;
    serverName?: string;
    serverIP?: string;
    id?: string;
    uploadSpeed: number;
    downloadSpeed: number;
    queuedClients: number;
    totalSourceCount: number;
}

// ========== Download Management ==========

export type DownloadPriority = 'Auto' | 'High' | 'Normal' | 'Low';

export type DownloadStatus =
    | 'Downloading'
    | 'Paused'
    | 'Complete'
    | 'Hashing'
    | 'Error'
    | 'Waiting';

export interface Download {
    hash: string;
    name: string;
    size: number;
    sizeDone: number;
    status: DownloadStatus;
    priority: DownloadPriority;
    speed: number;
    sources: number;
    sourcesNotCurrent: number;
    sourcesA4AF: number;
    sourcesXfer: number;
    percentComplete: number;
}

// ========== Upload Management ==========

export interface Upload {
    fileName: string;
    user: string;
    speed: number;
    transferred: number;
}

// ========== Search Operations ==========

export type SearchType = 'Global' | 'Kad' | 'Local';

export interface SearchResult {
    resultNumber: number;
    hash: string;
    fileName: string;
    size: number;
    sources: number;
    fileType?: string;
}

export interface ProgressResult {
    searchProgress: number;
    resultsCount: number;
    searching: boolean;
}

// ========== Server Management ==========

export interface Server {
    name: string;
    ip: string;
    port: number;
    description: string;
    users: number;
    files: number;
    ping?: number;
    priority: 'High' | 'Normal' | 'Low';
    failed: number;
    static: boolean;
}

// ========== Logs & Statistics ==========

export interface LogEntry {
    timestamp: Date;
    level: 'INFO' | 'WARN' | 'ERROR';
    message: string;
}

export interface Statistics {
    uptime: number;
    totalUploaded: number;
    totalDownloaded: number;
    sessionUploaded: number;
    sessionDownloaded: number;
    uploadRate: number;
    downloadRate: number;
    connectedClients: number;
    totalClients: number;
    sharedFiles: number;
}

// ========== Configuration ==========

export interface BandwidthLimits {
    uploadLimit: number;    // KB/s, 0 = unlimited
    downloadLimit: number;  // KB/s, 0 = unlimited
}

export interface IPFilterConfig {
    enabled: boolean;
    autoUpdate: boolean;
    url?: string;
    level: number;
}

// ========== Error Types ==========

export class AmuleError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AmuleError';
    }
}

export class AmuleConnectionError extends AmuleError {
    constructor(message: string = 'Failed to connect to aMule daemon') {
        super(message);
        this.name = 'AmuleConnectionError';
    }
}

export class AmuleCommandError extends AmuleError {
    constructor(command: string, message: string) {
        super(`Command '${command}' failed: ${message}`);
        this.name = 'AmuleCommandError';
    }
}

export class AmuleParseError extends AmuleError {
    constructor(message: string, rawOutput?: string) {
        super(`Failed to parse aMule output: ${message}`);
        this.name = 'AmuleParseError';
        if (rawOutput) {
            this.stack += `\n\nRaw Output:\n${rawOutput}`;
        }
    }
}

export class AmuleTimeoutError extends AmuleError {
    constructor(command: string, timeout: number) {
        super(`Command '${command}' timed out after ${timeout}ms`);
        this.name = 'AmuleTimeoutError';
    }
}
