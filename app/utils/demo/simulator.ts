/**
 * A pretend aMule daemon that lives in the browser.
 *
 * The public demo is a static site: there is no Nitro server behind it and no
 * daemon to speak EC to. Instead, this class plays the daemon *and* the parts of
 * the server the pages rely on (search sessions, automatic searches, speed
 * history, download timestamps), and `router.ts` maps the `/api/...` calls the
 * app makes onto its methods. The pages are unchanged: they cannot tell.
 *
 * Everything the real stack reports is reported here in the same units - KB/s
 * for status, downloads and uploads, bytes/s for the statistics endpoint - and
 * with the same semantics: a paused file does not move, a file that finishes
 * leaves the queue and turns up in the shared list, adding a link that is
 * already queued is a duplicate rather than a second download.
 *
 * State survives a reload through localStorage; `reset()` throws it away.
 */

import type { ApiResponse, AddLinkResult, AddLinksResult } from '#shared/types/api';
import type {
    AmulePreferences,
    BandwidthLimits,
    Download,
    DownloadPriority,
    SearchResult,
    SearchType,
    Server,
    SharedFile,
    Statistics,
    StatusResult,
    Upload
} from '../../../server/utils/amule-types';
import type { StatsTreeNode } from '../../../server/utils/amule-ec/statsTree';
import type { AutoSearch, AutoSearchDuration } from '../../../server/utils/autoSearchStore';
import type { StoredSearch } from '../../../server/utils/searchStore';
import type { SpeedSample } from '../../../server/utils/speedHistory';
import type { SpeedHistoryResponse } from '../../../server/api/amule/statistics/history.get';
import type { DownloadEvent } from '../../../server/utils/downloadEvents';
import { CATALOG, ed2kLinkOf, hashOf, type CatalogEntry } from './catalog';

export const DEMO_STORAGE_KEY = 'amule-demo-state-v1';

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

/** How often the world moves. */
export const TICK_MS = 1000;
/** How often a live frame is pushed to the socket listeners. */
const FRAME_EVERY_TICKS = 2;
const SPEED_SAMPLE_EVERY_TICKS = 2;
const MAX_SPEED_SAMPLES = 900;
const MAX_LOG_LINES = 400;

const AUTO_DURATIONS: Record<AutoSearchDuration, number | null> = {
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1m': 30 * 24 * 60 * 60 * 1000,
    forever: null
};
const AUTO_DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_MIN_INTERVAL_MS = 60 * 1000;
const AUTO_MAX_INTERVAL_MS = 60 * 60 * 1000;
const SEARCH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** How long a search keeps producing results, per network. */
const SEARCH_DURATION_MS: Record<SearchType, number> = { Kad: 40_000, Global: 12_000, Local: 2_500 };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface DemoDownload extends Download {
    /** Share of the global download budget this file gets, 0..1, drifts over time. */
    weight: number;
    /** Some files simply have nobody sharing them right now. */
    starved: boolean;
}

interface DemoUpload extends Upload {
    /** When this peer will leave, epoch ms. */
    leavesAt: number;
}

interface DemoServer extends Server {
    connected: boolean;
}

interface ActiveSearch {
    keyword: string;
    type: SearchType;
    startedAt: number;
    pool: SearchResult[];
    stopped: boolean;
}

interface DemoState {
    seededAt: number;
    startedAt: number;
    downloads: DemoDownload[];
    shared: SharedFile[];
    uploads: DemoUpload[];
    servers: DemoServer[];
    ed2k: 'connected' | 'connecting' | 'disconnected';
    ed2kSince: number;
    kadRunning: boolean;
    kadConnected: boolean;
    kadFirewalled: boolean;
    clientId: number;
    limits: BandwidthLimits;
    preferences: AmulePreferences;
    totals: { up: number; down: number; sessionUp: number; sessionDown: number };
    queuedClients: number;
    logs: string[];
    search: ActiveSearch | null;
    searchSessions: StoredSearch[];
    autoSearches: AutoSearch[];
}

interface Frame {
    status: StatusResult;
    downloads: Download[];
}

type FrameListener = (frame: Frame) => void;
type EventListener = (events: DownloadEvent[]) => void;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Deterministic RNG, so the same keyword always finds the same imaginary files. */
function seeded(seed: string): () => number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return () => {
        h += 0x6d2b79f5;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const random = Math.random;
const between = (min: number, max: number) => min + random() * (max - min);
const pick = <T>(list: readonly T[], rng: () => number = random): T => list[Math.floor(rng() * list.length)]!;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function timestamp(at: number = Date.now()): string {
    const d = new Date(at);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const CLIENT_SOFTWARE = ['aMule 2.3.3', 'aMule 3.0.0', 'eMule 0.70a', 'eMule 0.51d', 'eMule 0.60d', 'MLDonkey 3.1.7', 'aMule 2.3.2', 'eMule 0.50a'];
const PEER_NAMES = ['http://emule-project.net', 'lain', 'penguin_42', 'sol', 'marta_k', 'zeta', 'ubuntero', 'gnu_is_not_unix', 'akira', 'nordlicht', 'campanilla', 'oldtimer', 'vega', 'loreto', 'yatagarasu', 'bluebox'];

/** Documentation-range addresses: guaranteed not to belong to anyone. */
function fakeIp(rng: () => number = random): string {
    const block = pick(['192.0.2', '198.51.100', '203.0.113'], rng);
    return `${block}.${Math.floor(rng() * 254) + 1}`;
}

function kindFromName(name: string): { fileType: string; extension: string } {
    const extension = (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? '').toLowerCase();
    const type = /^(mp4|mkv|avi|mov|webm|wmv)$/.test(extension) ? 'video'
        : /^(mp3|flac|ogg|wav|aac|m4a)$/.test(extension) ? 'audio'
            : /^(zip|rar|7z|tar|gz|xz|bz2|iso|img)$/.test(extension) ? 'archive'
                : /^(pdf|epub|mobi|txt|doc|docx)$/.test(extension) ? 'document'
                    : /^(jpg|jpeg|png|gif|webp)$/.test(extension) ? 'image'
                        : /^(exe|msi|deb|rpm|dmg|apk)$/.test(extension) ? 'program'
                            : 'other';
    return { fileType: type, extension };
}

function resultOf(entry: { name: string; size: number }, sources: number, resultNumber: number): SearchResult {
    const hash = hashOf(entry.name, entry.size);
    return {
        resultNumber,
        hash,
        fileName: entry.name,
        size: entry.size,
        sources,
        ...kindFromName(entry.name),
        ed2kLink: ed2kLinkOf(entry.name, entry.size, hash)
    };
}

const ED2K_FILE_LINK = /^ed2k:\/\/\|file\|([^|]+)\|(\d+)\|([0-9a-fA-F]{32})\|/;
const MAGNET_ED2K = /xt=urn:ed2k:([0-9a-fA-F]{32})/i;

function parseLink(link: string): { name: string; size: number; hash: string } | null {
    const file = link.trim().match(ED2K_FILE_LINK);
    if (file) {
        let name = file[1]!;
        try { name = decodeURIComponent(name); } catch { /* keep as written */ }
        return { name, size: Number(file[2]), hash: file[3]!.toUpperCase() };
    }
    const magnet = link.match(MAGNET_ED2K);
    if (magnet && /^magnet:/i.test(link.trim())) {
        const params = new URLSearchParams(link.slice(link.indexOf('?') + 1));
        const name = params.get('dn') || `magnet-${magnet[1]!.slice(0, 8)}`;
        const size = Number(params.get('xl')) || Math.round(between(50 * MB, 2 * GB));
        return { name, size, hash: magnet[1]!.toUpperCase() };
    }
    return null;
}

// ---------------------------------------------------------------------------
// The daemon
// ---------------------------------------------------------------------------

export class DemoDaemon {
    private state: DemoState;
    private timer: ReturnType<typeof setInterval> | null = null;
    private ticks = 0;
    private frameListeners = new Set<FrameListener>();
    private eventListeners = new Set<EventListener>();
    private pendingEvents: DownloadEvent[] = [];
    private samples: SpeedSample[] = [];
    private dirty = false;
    private storage: Storage | null;

    constructor(storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage) {
        this.storage = storage;
        this.state = this.load() ?? seedState();
        this.state.startedAt = Date.now();
        this.state.totals.sessionUp = 0;
        this.state.totals.sessionDown = 0;
        // A reload should not pretend the previous tab's live search is still running.
        this.state.search = null;
        this.log('aMule Nuxt demo daemon started (nothing here is real)');
    }

    // ----- lifecycle -------------------------------------------------------

    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick(), TICK_MS);
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.save(true);
    }

    reset(): void {
        this.storage?.removeItem(DEMO_STORAGE_KEY);
        this.state = seedState();
        this.samples = [];
        this.log('Demo state reset');
        this.pushFrame();
    }

    onFrame(listener: FrameListener): () => void {
        this.frameListeners.add(listener);
        return () => this.frameListeners.delete(listener);
    }

    onDownloadEvents(listener: EventListener): () => void {
        this.eventListeners.add(listener);
        return () => this.eventListeners.delete(listener);
    }

    latestFrame(): Frame {
        return { status: this.status(), downloads: this.getDownloads() };
    }

    private load(): DemoState | null {
        try {
            const raw = this.storage?.getItem(DEMO_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as DemoState;
            return Array.isArray(parsed?.downloads) && Array.isArray(parsed?.shared) ? parsed : null;
        } catch {
            return null;
        }
    }

    private save(force = false): void {
        if (!this.storage || (!this.dirty && !force)) return;
        try {
            this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(this.state));
            this.dirty = false;
        } catch {
            // Quota or private mode: the demo simply forgets on reload
        }
    }

    private log(message: string): void {
        this.state.logs.push(`${timestamp()}: ${message}`);
        if (this.state.logs.length > MAX_LOG_LINES) this.state.logs.splice(0, this.state.logs.length - MAX_LOG_LINES);
        this.dirty = true;
    }

    // ----- the clock -------------------------------------------------------

    /** One second of simulated daemon life. Public so tests can drive it. */
    tick(now: number = Date.now()): void {
        this.ticks++;
        const s = this.state;

        // ed2k connection settles a couple of seconds after it was asked for
        if (s.ed2k === 'connecting' && now - s.ed2kSince > 2500) {
            s.ed2k = 'connected';
            const server = s.servers.find(server => server.connected);
            s.clientId = Math.floor(between(20_000_000, 4_000_000_000));
            this.log(`Connected to ${server?.name ?? 'server'} (${server?.ip}:${server?.port}) with HighID`);
        }
        if (s.kadRunning && !s.kadConnected && random() < 0.3) {
            s.kadConnected = true;
            this.log('Kademlia: connected, firewalled state: open');
        }

        this.tickDownloads(now);
        this.tickUploads(now);
        this.tickAutoSearches(now);

        if (this.ticks % SPEED_SAMPLE_EVERY_TICKS === 0) {
            const status = this.status();
            this.samples.push({ at: now, upload: status.uploadSpeed, download: status.downloadSpeed });
            if (this.samples.length > MAX_SPEED_SAMPLES) this.samples.shift();
        }

        if (this.ticks % FRAME_EVERY_TICKS === 0) this.pushFrame();
        if (this.pendingEvents.length > 0) {
            const events = this.pendingEvents;
            this.pendingEvents = [];
            this.eventListeners.forEach(listener => listener(events));
        }
        if (this.ticks % 5 === 0) this.save();
    }

    private pushFrame(): void {
        const frame = this.latestFrame();
        this.frameListeners.forEach(listener => listener(frame));
    }

    private networkUp(): boolean {
        return this.state.ed2k === 'connected' || this.state.kadConnected;
    }

    private tickDownloads(now: number): void {
        const s = this.state;
        const online = this.networkUp();
        const budgetKb = s.limits.downloadLimit > 0 ? s.limits.downloadLimit : 2600;
        // The total wobbles like a real link does
        const totalKb = online ? budgetKb * between(0.72, 0.98) : 0;

        const active = s.downloads.filter(d => d.status === 'Downloading' && !d.starved);
        const weightSum = active.reduce((sum, d) => sum + d.weight * priorityFactor(d.priority), 0) || 1;

        for (const d of s.downloads) {
            // Weights drift so the shares change slowly instead of being fixed
            d.weight = clamp(d.weight + between(-0.04, 0.04), 0.15, 1);

            if (d.status === 'Paused' || d.stopped) {
                d.speed = 0;
                d.sourcesXfer = 0;
                continue;
            }
            if (!online) {
                d.speed = 0;
                d.sourcesXfer = 0;
                d.status = 'Waiting';
                continue;
            }
            if (d.starved) {
                d.status = 'Waiting';
                d.speed = 0;
                d.sourcesXfer = 0;
                d.sources = Math.max(0, d.sources + (random() < 0.05 ? pick([-1, 1]) : 0));
                // A starved file occasionally finds a source again
                if (random() < 0.004) {
                    d.starved = false;
                    d.sources = Math.max(d.sources, 2);
                    this.log(`Found a new source for ${d.name}`);
                }
                continue;
            }
            d.status = 'Downloading';
            const share = (d.weight * priorityFactor(d.priority)) / weightSum;
            const speedKb = totalKb * share * between(0.9, 1.1);
            const bytes = Math.min(d.size - d.sizeDone, Math.round(speedKb * KB * (TICK_MS / 1000)));
            d.sizeDone += bytes;
            d.speed = Math.round((bytes / (TICK_MS / 1000) / KB) * 100) / 100;
            d.percentComplete = Math.round((d.sizeDone / d.size) * 10000) / 100;
            d.lastReceived = Math.floor(now / 1000);
            d.sourcesXfer = clamp(Math.round(d.sources * between(0.2, 0.6)), 1, d.sources);
            if (random() < 0.08) d.sources = clamp(d.sources + pick([-1, 1]), 1, 400);
            d.availableParts = Math.ceil(d.size / (9.28 * MB));
            s.totals.down += bytes;
            s.totals.sessionDown += bytes;

            if (random() < 0.0015) {
                d.starved = true;
                this.log(`Lost all sources for ${d.name}`);
            }

            if (d.sizeDone >= d.size) this.complete(d, now);
        }
    }

    private complete(d: DemoDownload, now: number): void {
        const s = this.state;
        s.downloads = s.downloads.filter(other => other.hash !== d.hash);
        s.shared.push({
            fileName: d.name,
            fullPath: `${s.preferences.directories.incoming}/${d.name}`,
            hash: d.hash,
            ecId: 1000 + s.shared.length,
            size: d.size,
            transferred: 0,
            transferredAll: 0,
            requests: 0,
            requestsAll: 0,
            accepts: 0,
            acceptsAll: 0,
            onQueue: 0,
            completeSources: d.sources,
            priority: 'Auto',
            autoPriority: true,
            ed2kLink: d.ed2kLink,
            comment: '',
            shareRatio: 0,
            completedAt: now,
            addedAt: d.addedAt
        });
        this.log(`Finished downloading ${d.name}`);
        this.pendingEvents.push({ kind: 'completed', hash: d.hash, name: d.name, size: d.size, at: now });
        this.dirty = true;
    }

    private tickUploads(now: number): void {
        const s = this.state;
        if (!this.networkUp() || s.shared.length === 0) {
            s.uploads = [];
            return;
        }
        const budgetKb = s.limits.uploadLimit > 0 ? s.limits.uploadLimit : 640;
        const slots = 5;

        // Peers leave, and the queue moves up
        s.uploads = s.uploads.filter(u => u.leavesAt > now);
        while (s.uploads.length < slots + 3 && random() < 0.5) s.uploads.push(this.newPeer(now));
        s.uploads.sort((a, b) => a.waitingPosition - b.waitingPosition);
        s.uploads.forEach((u, index) => { u.waitingPosition = index < slots ? 0 : index - slots + 1; });

        const active = s.uploads.filter(u => u.waitingPosition === 0);
        const totalKb = budgetKb * between(0.8, 1);
        for (const u of s.uploads) {
            if (u.waitingPosition > 0) {
                u.speed = 0;
                continue;
            }
            const speedKb = (totalKb / active.length) * between(0.7, 1.3);
            const bytes = Math.round(speedKb * KB * (TICK_MS / 1000));
            u.speed = Math.round(speedKb * 100) / 100;
            u.transferred += bytes;
            u.transferredTotal += bytes;
            s.totals.up += bytes;
            s.totals.sessionUp += bytes;
            const file = s.shared.find(f => f.hash === u.fileHash);
            if (file) {
                file.transferred += bytes;
                file.transferredAll += bytes;
                file.shareRatio = file.transferredAll / file.size;
            }
        }
        s.queuedClients = Math.max(0, s.uploads.length - active.length + Math.floor(between(3, 15)));
        for (const file of s.shared) {
            file.onQueue = s.uploads.filter(u => u.fileHash === file.hash && u.waitingPosition > 0).length;
        }
    }

    private newPeer(now: number): DemoUpload {
        const s = this.state;
        // Popular files get asked for more often
        const file = pick(s.shared);
        file.requests++;
        file.requestsAll++;
        file.accepts++;
        file.acceptsAll++;
        return {
            fileName: file.fileName,
            user: pick(PEER_NAMES),
            speed: 0,
            transferred: 0,
            transferredTotal: random() < 0.4 ? Math.round(between(1 * MB, 400 * MB)) : 0,
            receivedTotal: random() < 0.3 ? Math.round(between(1 * MB, 900 * MB)) : 0,
            userIp: fakeIp(),
            userPort: Math.floor(between(4000, 65000)),
            clientSoftware: pick(CLIENT_SOFTWARE),
            waitingPosition: 99,
            score: Math.floor(between(100, 9000)),
            remoteFileName: '',
            fileHash: file.hash,
            fileEcId: file.ecId,
            leavesAt: now + between(25_000, 240_000)
        };
    }

    // ----- status, statistics ---------------------------------------------

    status(): StatusResult {
        const s = this.state;
        const server = s.servers.find(server => server.connected);
        const download = s.downloads.reduce((sum, d) => sum + d.speed, 0);
        const upload = s.uploads.reduce((sum, u) => sum + u.speed, 0);
        return {
            connected: true,
            ed2kConnected: s.ed2k === 'connected',
            ed2kConnecting: s.ed2k === 'connecting',
            kadConnected: s.kadConnected,
            kadRunning: s.kadRunning,
            kadFirewalled: s.kadFirewalled,
            serverName: s.ed2k === 'disconnected' ? undefined : server?.name,
            serverIP: s.ed2k === 'disconnected' ? undefined : `${server?.ip}:${server?.port}`,
            id: s.ed2k === 'connected' ? String(s.clientId) : undefined,
            uploadSpeed: Math.round(upload * 100) / 100,
            downloadSpeed: Math.round(download * 100) / 100,
            queuedClients: s.queuedClients,
            totalSourceCount: s.downloads.reduce((sum, d) => sum + d.sources, 0)
        };
    }

    getStatistics(): Statistics {
        const s = this.state;
        const status = this.status();
        const server = s.servers.find(server => server.connected);
        return {
            uptime: Math.floor((Date.now() - s.startedAt) / 1000),
            totalUploaded: s.totals.up,
            totalDownloaded: s.totals.down,
            sessionUploaded: s.totals.sessionUp,
            sessionDownloaded: s.totals.sessionDown,
            uploadRate: Math.round(status.uploadSpeed * KB),
            downloadRate: Math.round(status.downloadSpeed * KB),
            uploadLimit: s.limits.uploadLimit,
            downloadLimit: s.limits.downloadLimit,
            queuedClients: s.queuedClients,
            totalSourceCount: status.totalSourceCount,
            bannedClients: 3,
            sharedFiles: s.shared.length,
            ed2kUsers: s.ed2k === 'connected' ? (server?.users ?? 0) : 0,
            ed2kFiles: s.ed2k === 'connected' ? (server?.files ?? 0) : 0,
            kadUsers: s.kadConnected ? 2_310_000 + Math.floor(between(-40_000, 40_000)) : 0,
            kadFiles: s.kadConnected ? 380_000_000 + Math.floor(between(-2_000_000, 2_000_000)) : 0
        };
    }

    getSpeedHistory(minutes: number): SpeedHistoryResponse {
        const since = Date.now() - clamp(minutes, 1, 120) * 60_000;
        const window = this.samples.filter(sample => sample.at >= since);
        if (window.length === 0) {
            return { samples: [], peakUpload: 0, peakDownload: 0, averageUpload: 0, averageDownload: 0 };
        }
        const sum = window.reduce((acc, sample) => ({ up: acc.up + sample.upload, down: acc.down + sample.download }), { up: 0, down: 0 });
        return {
            samples: window,
            peakUpload: Math.max(...window.map(sample => sample.upload)),
            peakDownload: Math.max(...window.map(sample => sample.download)),
            averageUpload: sum.up / window.length,
            averageDownload: sum.down / window.length
        };
    }

    getStatsTree(): StatsTreeNode {
        const s = this.state;
        const stats = this.getStatistics();
        const fmt = (bytes: number) => bytes >= GB ? `${(bytes / GB).toFixed(2)} GB` : bytes >= MB ? `${(bytes / MB).toFixed(2)} MB` : `${(bytes / KB).toFixed(1)} KB`;
        const speed = (kb: number) => `${kb.toFixed(2)} KB/s`;
        const leaf = (label: string): StatsTreeNode => ({ label, children: [] });
        const connectedServer = s.servers.find(server => server.connected);
        return {
            label: 'Statistics',
            children: [
                {
                    label: `Uploads: ${speed(stats.uploadRate / KB)} (${s.uploads.filter(u => u.waitingPosition === 0).length} active)`,
                    children: [
                        leaf(`Uploaded data (session): ${fmt(stats.sessionUploaded)}`),
                        leaf(`Uploaded data (total): ${fmt(stats.totalUploaded)}`),
                        leaf(`Active uploads: ${s.uploads.filter(u => u.waitingPosition === 0).length}`),
                        leaf(`Waiting uploads: ${stats.queuedClients}`),
                        leaf(`Upload limit: ${s.limits.uploadLimit || 'unlimited'} KB/s`)
                    ]
                },
                {
                    label: `Downloads: ${speed(stats.downloadRate / KB)} (${s.downloads.filter(d => d.speed > 0).length} active)`,
                    children: [
                        leaf(`Downloaded data (session): ${fmt(stats.sessionDownloaded)}`),
                        leaf(`Downloaded data (total): ${fmt(stats.totalDownloaded)}`),
                        leaf(`Found sources: ${stats.totalSourceCount}`),
                        leaf(`Active downloads: ${s.downloads.filter(d => d.speed > 0).length}`),
                        leaf(`Paused downloads: ${s.downloads.filter(d => d.status === 'Paused').length}`),
                        leaf(`Download limit: ${s.limits.downloadLimit || 'unlimited'} KB/s`)
                    ]
                },
                {
                    label: 'Connection',
                    children: [
                        leaf(`Session uptime: ${Math.floor(stats.uptime / 60)} min`),
                        leaf(`Client ID: ${s.ed2k === 'connected' ? `${s.clientId} (HighID)` : 'not connected'}`),
                        leaf(`TCP port: ${s.preferences.connection.tcpPort}`),
                        leaf(`UDP port: ${s.preferences.connection.udpPort}`),
                        leaf(`Reconnects: 1`)
                    ]
                },
                {
                    label: 'Clients',
                    children: [
                        leaf(`Total: ${s.uploads.length + stats.totalSourceCount}`),
                        leaf(`Banned: ${stats.bannedClients}`),
                        leaf(`Filtered: 12`),
                        leaf(`aMule: ${Math.round((s.uploads.length + stats.totalSourceCount) * 0.31)}`),
                        leaf(`eMule: ${Math.round((s.uploads.length + stats.totalSourceCount) * 0.57)}`),
                        leaf(`MLDonkey: ${Math.round((s.uploads.length + stats.totalSourceCount) * 0.06)}`)
                    ]
                },
                {
                    label: 'Servers',
                    children: [
                        leaf(`Working servers: ${s.servers.length - s.servers.filter(server => server.failed > 2).length}`),
                        leaf(`Failed servers: ${s.servers.filter(server => server.failed > 2).length}`),
                        leaf(`Total: ${s.servers.length}`),
                        leaf(`Current server: ${connectedServer && s.ed2k === 'connected' ? connectedServer.name : 'none'}`),
                        leaf(`Users on current server: ${stats.ed2kUsers}`),
                        leaf(`Files on current server: ${stats.ed2kFiles}`)
                    ]
                },
                {
                    label: 'Shared files',
                    children: [
                        leaf(`Number of shared files: ${s.shared.length}`),
                        leaf(`Total size of shared files: ${fmt(s.shared.reduce((sum, f) => sum + f.size, 0))}`),
                        leaf(`Average file size: ${fmt(s.shared.reduce((sum, f) => sum + f.size, 0) / Math.max(1, s.shared.length))}`)
                    ]
                },
                {
                    label: 'Kademlia',
                    children: [
                        leaf(`Status: ${s.kadConnected ? 'connected' : s.kadRunning ? 'connecting' : 'stopped'}`),
                        leaf(`Firewalled: ${s.kadFirewalled ? 'yes' : 'no'}`),
                        leaf(`Estimated users: ${stats.kadUsers}`),
                        leaf(`Estimated files: ${stats.kadFiles}`),
                        leaf(`Contacts: ${s.kadConnected ? 480 + Math.floor(between(-30, 30)) : 0}`)
                    ]
                }
            ]
        };
    }

    getLogs(): string[] {
        return [...this.state.logs];
    }

    getServerInfo(): string[] {
        const s = this.state;
        const server = s.servers.find(server => server.connected);
        if (!server || s.ed2k !== 'connected') return [];
        return [
            `Welcome to ${server.name}!`,
            '',
            'This is a simulated server that exists only inside the aMule Nuxt demo.',
            'No files are transferred and nothing is connected to a real network.',
            '',
            `Users: ${server.users.toLocaleString('en-US')} - Files: ${server.files.toLocaleString('en-US')}`,
            'Enjoy the tour.'
        ];
    }

    // ----- downloads -------------------------------------------------------

    getDownloads(): Download[] {
        return this.state.downloads.map(({ weight, starved, ...download }) => ({ ...download }));
    }

    addLinks(links: string[]): AddLinksResult {
        const results: AddLinkResult[] = links.map(link => this.addLink(link));
        return {
            results,
            added: results.filter(r => r.status === 'added').length,
            duplicates: results.filter(r => r.status === 'duplicate').length,
            rejected: results.filter(r => r.status === 'rejected').length
        };
    }

    private addLink(link: string): AddLinkResult {
        const parsed = parseLink(link);
        if (!parsed) {
            return { link, success: false, status: 'rejected', message: 'Not a valid ed2k file link (expected ed2k://|file|name|size|hash|/)' };
        }
        if (!parsed.size || parsed.size <= 0) {
            return { link, success: false, status: 'rejected', message: 'The link carries no file size' };
        }
        return this.addFile(parsed, link);
    }

    private addFile(file: { name: string; size: number; hash: string }, link: string, sources?: number): AddLinkResult {
        const s = this.state;
        const queued = s.downloads.find(d => d.hash === file.hash);
        if (queued) {
            return { link, success: true, status: 'duplicate', message: `Already in the download queue: ${queued.name}`, existingName: queued.name };
        }
        const shared = s.shared.find(f => f.hash === file.hash);
        if (shared) {
            return { link, success: true, status: 'duplicate', message: `Already downloaded and shared: ${shared.fileName}`, existingName: shared.fileName };
        }
        const now = Date.now();
        const catalogEntry = CATALOG.find(entry => entry.name === file.name);
        const sourceCount = sources ?? (catalogEntry ? Math.round(8 + catalogEntry.popularity * 60) : Math.floor(between(0, 12)));
        s.downloads.push({
            hash: file.hash,
            name: file.name,
            size: file.size,
            sizeDone: 0,
            status: sourceCount === 0 ? 'Waiting' : 'Downloading',
            priority: 'Auto',
            autoPriority: true,
            speed: 0,
            sources: sourceCount,
            sourcesNotCurrent: Math.floor(sourceCount * 0.2),
            sourcesA4AF: 0,
            sourcesXfer: 0,
            percentComplete: 0,
            ed2kLink: ed2kLinkOf(file.name, file.size, file.hash),
            availableParts: 0,
            stopped: false,
            lastReceived: 0,
            lastSeenComplete: catalogEntry ? Math.floor(now / 1000) - Math.floor(between(60, 86_400)) : 0,
            addedAt: now,
            firstSeenAt: now,
            startKnown: true,
            weight: between(0.3, 1),
            starved: sourceCount === 0
        });
        this.log(`Added download: ${file.name}`);
        this.pendingEvents.push({ kind: 'added', hash: file.hash, name: file.name, size: file.size, at: now });
        this.dirty = true;
        return { link, success: true, status: 'added', message: `Added ${file.name}` };
    }

    private findDownload(id: string): DemoDownload | undefined {
        return this.state.downloads.find(d => d.hash.toUpperCase() === id.toUpperCase());
    }

    pause(id: string): ApiResponse {
        const d = this.findDownload(id);
        if (!d) return { success: false, error: `No download with hash ${id}` };
        d.status = 'Paused';
        d.speed = 0;
        this.log(`Paused ${d.name}`);
        return { success: true, message: `Paused ${d.name}` };
    }

    resume(id: string): ApiResponse {
        const d = this.findDownload(id);
        if (!d) return { success: false, error: `No download with hash ${id}` };
        d.status = d.starved ? 'Waiting' : 'Downloading';
        d.stopped = false;
        this.log(`Resumed ${d.name}`);
        return { success: true, message: `Resumed ${d.name}` };
    }

    cancel(id: string): ApiResponse {
        const d = this.findDownload(id);
        if (!d) return { success: false, error: `No download with hash ${id}` };
        this.state.downloads = this.state.downloads.filter(other => other !== d);
        this.log(`Removed ${d.name} from the queue`);
        this.dirty = true;
        return { success: true, message: `Removed ${d.name}` };
    }

    setPriority(id: string, priority: DownloadPriority): ApiResponse {
        const d = this.findDownload(id);
        if (!d) return { success: false, error: `No download with hash ${id}` };
        d.priority = priority;
        d.autoPriority = priority === 'Auto';
        return { success: true, message: `Priority of ${d.name} set to ${priority}` };
    }

    // ----- uploads, shared -----------------------------------------------

    getUploads(): Upload[] {
        return this.state.uploads.map(({ leavesAt, ...upload }) => ({ ...upload }));
    }

    getSharedFiles(): SharedFile[] {
        return this.state.shared.map(file => ({ ...file }));
    }

    // ----- search ----------------------------------------------------------

    search(type: SearchType, keyword: string): ApiResponse {
        if (!this.networkUp()) {
            return { success: false, error: 'Not connected to any network: connect to a server or start Kad first' };
        }
        if (type === 'Kad' && !this.state.kadConnected) {
            return { success: false, error: 'Kad is not connected' };
        }
        if (type !== 'Kad' && this.state.ed2k !== 'connected') {
            return { success: false, error: 'Not connected to an eD2k server' };
        }
        this.state.search = {
            keyword,
            type,
            startedAt: Date.now(),
            pool: buildResultPool(keyword, type),
            stopped: false
        };
        this.log(`Search started (${type}): ${keyword}`);
        return { success: true, message: `Search started: ${keyword}` };
    }

    getSearchResults(): { results: SearchResult[]; progress: number } {
        const search = this.state.search;
        if (!search) return { results: [], progress: 100 };
        const elapsed = Date.now() - search.startedAt;
        const duration = SEARCH_DURATION_MS[search.type];
        // Results arrive front-loaded: most in the first third, stragglers after
        const fraction = search.stopped ? 1 : clamp(Math.sqrt(elapsed / duration), 0, 1);
        const revealed = Math.round(search.pool.length * fraction);
        return {
            results: search.pool.slice(0, revealed),
            progress: search.stopped ? 100 : Math.round(clamp(elapsed / duration, 0, 1) * 100)
        };
    }

    stopSearch(): ApiResponse {
        if (this.state.search) this.state.search.stopped = true;
        return { success: true, message: 'Search stopped' };
    }

    downloadFromSearch(identifier: string | number): ApiResponse {
        const search = this.state.search;
        const pool = [
            ...(search?.pool ?? []),
            ...this.state.autoSearches.flatMap(auto => auto.results),
            ...this.state.searchSessions.flatMap(session => session.results)
        ];
        const result = typeof identifier === 'number'
            ? pool.find(r => r.resultNumber === identifier)
            : pool.find(r => r.hash.toUpperCase() === String(identifier).toUpperCase());
        if (!result) return { success: false, error: 'That result is not in any search the daemon still knows about' };
        const added = this.addFile({ name: result.fileName, size: result.size, hash: result.hash }, result.ed2kLink, Math.max(1, result.sources));
        return added.status === 'rejected'
            ? { success: false, error: added.message }
            : { success: true, message: added.message };
    }

    // ----- stored searches (what searchStore.ts does on the server) ---------

    listSearchSessions(): { searches: StoredSearch[]; retentionMs: number } {
        const cutoff = Date.now() - SEARCH_RETENTION_MS;
        this.state.searchSessions = this.state.searchSessions.filter(search => search.updatedAt >= cutoff);
        return { searches: [...this.state.searchSessions].sort((a, b) => b.startedAt - a.startedAt), retentionMs: SEARCH_RETENTION_MS };
    }

    saveSearchSession(search: StoredSearch): { stored: number } {
        const list = this.state.searchSessions.filter(existing => existing.id !== search.id);
        if (search.results.length > 0) list.unshift({ ...search, results: search.results.slice(0, 500) });
        this.state.searchSessions = list.slice(0, 20);
        this.dirty = true;
        return { stored: this.state.searchSessions.length };
    }

    removeSearchSession(id: string): boolean {
        const before = this.state.searchSessions.length;
        this.state.searchSessions = this.state.searchSessions.filter(search => search.id !== id);
        this.dirty = true;
        return this.state.searchSessions.length < before;
    }

    // ----- automatic searches ---------------------------------------------

    listAutoSearches(): AutoSearch[] {
        return this.state.autoSearches.map(search => ({ ...search, results: [...search.results] }));
    }

    getAutoSearch(id: string): AutoSearch | null {
        const search = this.state.autoSearches.find(search => search.id === id);
        return search ? { ...search, results: [...search.results] } : null;
    }

    createAutoSearch(input: { keyword: string; networks: SearchType[]; duration: AutoSearchDuration; intervalMs?: number }): AutoSearch {
        const now = Date.now();
        const span = AUTO_DURATIONS[input.duration];
        const search: AutoSearch = {
            id: `auto-${now.toString(36)}-${Math.floor(random() * 1e6).toString(36)}`,
            keyword: input.keyword,
            networks: input.networks,
            intervalMs: clamp(input.intervalMs || AUTO_DEFAULT_INTERVAL_MS, AUTO_MIN_INTERVAL_MS, AUTO_MAX_INTERVAL_MS),
            duration: input.duration,
            createdAt: now,
            endsAt: span === null ? null : now + span,
            lastRunAt: 0,
            nextRunAt: now,
            runs: 0,
            newLastRun: 0,
            status: 'active',
            results: []
        };
        this.state.autoSearches.unshift(search);
        this.runAutoSearch(search, now);
        this.dirty = true;
        return { ...search };
    }

    stopAutoSearch(id: string): AutoSearch | null {
        const search = this.state.autoSearches.find(search => search.id === id);
        if (!search) return null;
        search.status = 'stopped';
        this.dirty = true;
        return { ...search };
    }

    resumeAutoSearch(id: string): AutoSearch | null {
        const search = this.state.autoSearches.find(search => search.id === id);
        if (!search) return null;
        const now = Date.now();
        const span = AUTO_DURATIONS[search.duration];
        Object.assign(search, { status: 'active', createdAt: now, endsAt: span === null ? null : now + span, nextRunAt: now });
        this.dirty = true;
        return { ...search };
    }

    removeAutoSearch(id: string): boolean {
        const before = this.state.autoSearches.length;
        this.state.autoSearches = this.state.autoSearches.filter(search => search.id !== id);
        this.dirty = true;
        return this.state.autoSearches.length < before;
    }

    private tickAutoSearches(now: number): void {
        for (const search of this.state.autoSearches) {
            if (search.status !== 'active') continue;
            if (search.endsAt !== null && now >= search.endsAt) {
                search.status = 'finished';
                this.dirty = true;
                continue;
            }
            if (now >= search.nextRunAt) this.runAutoSearch(search, now);
        }
    }

    /** One pass: a slice of what the network would answer, merged by hash. */
    private runAutoSearch(search: AutoSearch, now: number): void {
        const network = search.networks[search.runs % search.networks.length]!;
        if (!this.networkUp()) {
            search.lastError = 'Not connected to any network';
            search.nextRunAt = now + search.intervalMs;
            return;
        }
        const pool = buildResultPool(search.keyword, network, `${search.id}-${search.runs}`);
        const known = new Set(search.results.map(result => result.hash));
        // Each pass sees a different part of the network, so results accumulate
        const seen = pool.filter(() => random() < 0.55);
        const fresh = seen.filter(result => !known.has(result.hash));
        search.results.push(...fresh);
        search.newLastRun = fresh.length;
        search.runs++;
        search.lastRunAt = now;
        search.nextRunAt = now + search.intervalMs;
        search.lastError = undefined;
        this.log(`Automatic search "${search.keyword}" (${network}): ${fresh.length} new of ${seen.length} results`);
        this.dirty = true;
    }

    // ----- servers, networks ---------------------------------------------

    getServers(): Server[] {
        return this.state.servers.map(({ connected, ...server }) => ({ ...server }));
    }

    addServer(address: string, name?: string): ApiResponse {
        const [ip, portText] = address.split(':');
        const port = Number(portText);
        if (!ip || !Number.isFinite(port) || port <= 0) {
            return { success: false, error: 'Server address must be ip:port' };
        }
        if (this.state.servers.some(server => server.ip === ip && server.port === port)) {
            return { success: false, error: 'That server is already in the list' };
        }
        this.state.servers.push({
            name: name || ip,
            ip,
            port,
            description: 'Added by hand',
            users: 0,
            files: 0,
            priority: 'Normal',
            failed: 0,
            static: true,
            connected: false
        });
        this.log(`Added server ${name || ip} (${address})`);
        this.dirty = true;
        return { success: true, message: `Server ${name || address} added` };
    }

    removeServer(address: string): ApiResponse {
        const [ip, portText] = address.split(':');
        const index = this.state.servers.findIndex(server => server.ip === ip && server.port === Number(portText));
        if (index < 0) return { success: false, error: `No server at ${address}` };
        const [server] = this.state.servers.splice(index, 1);
        if (server!.connected) {
            this.state.ed2k = 'disconnected';
            this.log(`Disconnected from ${server!.name}`);
        }
        this.log(`Removed server ${server!.name}`);
        this.dirty = true;
        return { success: true, message: `Server ${server!.name} removed` };
    }

    connectToServer(address: string): ApiResponse {
        const [ip, portText] = address.split(':');
        const target = this.state.servers.find(server => server.ip === ip && server.port === Number(portText));
        if (!target) return { success: false, error: `No server at ${address}` };
        this.state.servers.forEach(server => { server.connected = server === target; });
        this.state.ed2k = 'connecting';
        this.state.ed2kSince = Date.now();
        this.log(`Connecting to ${target.name} (${address})...`);
        this.dirty = true;
        return { success: true, message: `Connecting to ${target.name}` };
    }

    updateServerList(url?: string): ApiResponse {
        const added = Math.floor(between(0, 3));
        for (let i = 0; i < added; i++) {
            const ip = fakeIp();
            if (this.state.servers.some(server => server.ip === ip)) continue;
            this.state.servers.push({
                name: pick(['Open Harbour', 'Lighthouse Relay', 'Northern Index', 'Quiet Archive', 'Meridian Hub']),
                ip,
                port: pick([4661, 4242, 5000, 3306]),
                description: 'From server.met',
                users: Math.floor(between(2_000, 90_000)),
                files: Math.floor(between(500_000, 40_000_000)),
                priority: 'Normal',
                failed: 0,
                static: false,
                connected: false
            });
        }
        this.log(`Server list updated from ${url || 'the configured URL'}: ${added} new server(s)`);
        this.dirty = true;
        return { success: true, message: `Server list updated, ${added} new server(s)` };
    }

    connect(network?: 'kad' | 'ed2k'): ApiResponse {
        const s = this.state;
        if (!network || network === 'ed2k') {
            if (!s.servers.some(server => server.connected)) {
                const best = [...s.servers].sort((a, b) => b.users - a.users)[0];
                if (best) best.connected = true;
            }
            if (s.ed2k === 'disconnected') {
                s.ed2k = 'connecting';
                s.ed2kSince = Date.now();
                this.log('Connecting to eD2k network...');
            }
        }
        if (!network || network === 'kad') {
            s.kadRunning = true;
            if (!s.kadConnected) this.log('Kademlia: starting...');
        }
        this.dirty = true;
        return { success: true, message: 'Connecting...' };
    }

    disconnect(network?: 'kad' | 'ed2k'): ApiResponse {
        const s = this.state;
        if (!network || network === 'ed2k') {
            s.ed2k = 'disconnected';
            this.log('Disconnected from eD2k network');
        }
        if (!network || network === 'kad') {
            s.kadRunning = false;
            s.kadConnected = false;
            this.log('Kademlia stopped');
        }
        this.dirty = true;
        return { success: true, message: 'Disconnected' };
    }

    kad(action: string, body: { ip?: string; port?: number; url?: string }): ApiResponse {
        const s = this.state;
        switch (action) {
            case 'start': return this.connect('kad');
            case 'stop': return this.disconnect('kad');
            case 'bootstrap':
                if (!body.ip || !body.port) return { success: false, error: 'An ip and port are required to bootstrap Kad' };
                s.kadRunning = true;
                this.log(`Kademlia: bootstrapping from ${body.ip}:${body.port}`);
                return { success: true, message: `Bootstrapping Kad from ${body.ip}:${body.port}` };
            case 'update-nodes':
                this.log(`Kademlia: nodes.dat updated from ${body.url || 'the default URL'}`);
                return { success: true, message: 'nodes.dat updated' };
            default:
                return { success: false, error: "action must be one of 'start', 'stop', 'bootstrap', 'update-nodes'" };
        }
    }

    // ----- preferences, limits -------------------------------------------

    getPreferences(): AmulePreferences {
        return JSON.parse(JSON.stringify(this.state.preferences));
    }

    setPreferences(body: Partial<AmulePreferences>): ApiResponse<{ applied: string[] }> {
        const applied: string[] = [];
        if (typeof body.nickname === 'string') {
            this.state.preferences.nickname = body.nickname.slice(0, 60);
            applied.push('nickname');
        }
        if (body.connection && typeof body.connection === 'object') {
            Object.assign(this.state.preferences.connection, body.connection);
            this.state.limits = {
                uploadLimit: Number(this.state.preferences.connection.maxUpload) || 0,
                downloadLimit: Number(this.state.preferences.connection.maxDownload) || 0
            };
            applied.push('connection');
        }
        if (body.servers && typeof body.servers === 'object') {
            Object.assign(this.state.preferences.servers, body.servers);
            applied.push('servers');
        }
        if (applied.length === 0) return { success: false, error: 'Nothing to update' };
        this.log(`Preferences updated: ${applied.join(', ')}`);
        this.dirty = true;
        return { success: true, message: `Updated: ${applied.join(', ')}`, data: { applied } };
    }

    getBandwidthLimits(): BandwidthLimits {
        return { ...this.state.limits };
    }

    setBandwidthLimits(limits: BandwidthLimits): ApiResponse<BandwidthLimits> {
        const upload = Math.max(0, Math.floor(Number(limits.uploadLimit) || 0));
        const download = Math.max(0, Math.floor(Number(limits.downloadLimit) || 0));
        this.state.limits = { uploadLimit: upload, downloadLimit: download };
        this.state.preferences.connection.maxUpload = upload;
        this.state.preferences.connection.maxDownload = download;
        this.log(`Bandwidth limits set to ${upload || 'unlimited'} KB/s up, ${download || 'unlimited'} KB/s down`);
        this.dirty = true;
        return { success: true, message: 'Bandwidth limits applied', data: { ...this.state.limits } };
    }
}

function priorityFactor(priority: DownloadPriority): number {
    return priority === 'High' ? 1.8 : priority === 'Low' ? 0.5 : 1;
}

// ---------------------------------------------------------------------------
// Search results
// ---------------------------------------------------------------------------

const GENERIC_EXTENSIONS = ['zip', 'pdf', 'mp4', 'mkv', 'epub', 'iso', 'rar', 'mp3', 'flac', 'avi', '7z', 'txt'];
const GENERIC_SUFFIXES = ['', ' (2024)', ' (2025)', ' - complete', ' - part 1', ' - part 2', ' [HD]', ' 1080p', ' collection', ' - remastered', ' vol. 1', ' - archive', ' documentation', ' tutorial', ' handbook'];

/**
 * What a search for `keyword` on `network` would turn up: the catalogue files
 * whose name or tags contain every word, some variants of those, and - so that a
 * search never comes back empty in a demo - a handful of made-up files named
 * after the keyword. Deterministic per keyword and salt.
 */
export function buildResultPool(keyword: string, network: SearchType, salt = ''): SearchResult[] {
    const rng = seeded(`${keyword.toLowerCase()}|${network}|${salt}`);
    const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const matches = CATALOG.filter(entry => {
        const haystack = `${entry.name} ${entry.tags.join(' ')}`.toLowerCase();
        return words.every(word => haystack.includes(word));
    });

    // Kad reaches further than one server does
    const reach = network === 'Kad' ? 1 : network === 'Global' ? 0.75 : 0.3;
    const pool: Array<{ name: string; size: number; sources: number }> = [];

    for (const entry of matches) {
        pool.push({ name: entry.name, size: entry.size, sources: Math.round((6 + entry.popularity * 180) * reach * (0.7 + rng() * 0.6)) });
        for (const variant of variantsOf(entry, rng)) pool.push(variant);
    }

    const invented = matches.length > 0 ? Math.floor(rng() * 6) : 6 + Math.floor(rng() * 14);
    const label = keyword.trim().replace(/\s+/g, ' ');
    const used = new Set(pool.map(item => item.name));
    for (let i = 0; i < invented; i++) {
        const name = `${label}${pick(GENERIC_SUFFIXES, rng)}.${pick(GENERIC_EXTENSIONS, rng)}`;
        if (used.has(name)) continue;
        used.add(name);
        pool.push({ name, size: Math.round(Math.pow(10, 6 + rng() * 3.7)), sources: Math.round((1 + rng() * 40) * reach) });
    }

    // Better-sourced files first, the way a busy network reports them
    pool.sort((a, b) => b.sources - a.sources);
    return pool.map((item, index) => resultOf(item, Math.max(1, item.sources), index + 1));
}

function variantsOf(entry: CatalogEntry, rng: () => number): Array<{ name: string; size: number; sources: number }> {
    const variants: Array<{ name: string; size: number; sources: number }> = [];
    const base = entry.name.replace(/\.[a-z0-9]{1,5}$/i, '');
    if (rng() < 0.6) variants.push({ name: `${entry.name}.torrent`, size: Math.round(20_000 + rng() * 200_000), sources: Math.round(1 + rng() * 15) });
    if (rng() < 0.4) variants.push({ name: `${base} - SHA256SUMS.txt`, size: Math.round(600 + rng() * 3000), sources: Math.round(1 + rng() * 6) });
    if (entry.kind === 'iso' && rng() < 0.5) variants.push({ name: `${entry.name}.zsync`, size: Math.round(entry.size / 2400), sources: Math.round(1 + rng() * 8) });
    if (entry.kind === 'video' && rng() < 0.5) variants.push({ name: `${base} [720p].mp4`, size: Math.round(entry.size * 0.45), sources: Math.round(2 + rng() * 40) });
    if (entry.kind === 'book' && rng() < 0.5) variants.push({ name: `${base}.mobi`, size: Math.round(entry.size * 1.3), sources: Math.round(1 + rng() * 10) });
    return variants;
}

// ---------------------------------------------------------------------------
// The opening scene
// ---------------------------------------------------------------------------

function seedState(): DemoState {
    const now = Date.now();
    const hours = (n: number) => n * 3_600_000;
    const entry = (name: string) => CATALOG.find(item => item.name === name)!;

    const download = (name: string, done: number, extra: Partial<DemoDownload> = {}): DemoDownload => {
        const item = entry(name);
        const hash = hashOf(item.name, item.size);
        const sizeDone = Math.round(item.size * done);
        const sources = extra.sources ?? Math.round(6 + item.popularity * 70);
        return {
            hash,
            name: item.name,
            size: item.size,
            sizeDone,
            status: 'Downloading',
            priority: 'Auto',
            autoPriority: true,
            speed: 0,
            sources,
            sourcesNotCurrent: Math.floor(sources * 0.2),
            sourcesA4AF: Math.floor(sources * 0.05),
            sourcesXfer: 0,
            percentComplete: Math.round(done * 10000) / 100,
            ed2kLink: ed2kLinkOf(item.name, item.size, hash),
            availableParts: Math.ceil(item.size / (9.28 * MB)),
            stopped: false,
            lastReceived: Math.floor(now / 1000) - 30,
            lastSeenComplete: Math.floor(now / 1000) - 3600,
            addedAt: now - hours(between(1, 30)),
            firstSeenAt: now - hours(between(1, 30)),
            startKnown: true,
            weight: between(0.3, 1),
            starved: false,
            ...extra
        };
    };

    const shared = (name: string, ratio: number, index: number): SharedFile => {
        const item = entry(name);
        const hash = hashOf(item.name, item.size);
        const transferredAll = Math.round(item.size * ratio);
        return {
            fileName: item.name,
            fullPath: `/home/demo/Incoming/${item.name}`,
            hash,
            ecId: 1000 + index,
            size: item.size,
            transferred: Math.round(transferredAll * 0.03),
            transferredAll,
            requests: Math.floor(between(0, 12)),
            requestsAll: Math.floor(between(40, 3000)),
            accepts: Math.floor(between(0, 8)),
            acceptsAll: Math.floor(between(20, 1500)),
            onQueue: 0,
            completeSources: Math.floor(between(3, 120)),
            priority: 'Auto',
            autoPriority: true,
            ed2kLink: ed2kLinkOf(item.name, item.size, hash),
            comment: '',
            shareRatio: ratio,
            completedAt: now - hours(between(24, 1400)),
            addedAt: now - hours(between(1500, 2000))
        };
    };

    const downloads: DemoDownload[] = [
        download('xubuntu-24.04.2-desktop-amd64.iso', 0.63),
        download('wikipedia_es_all_maxi_2025-06.zim', 0.184, { priority: 'High', autoPriority: false }),
        download('wikipedia_en_all_maxi_2025-07.zim', 0.041, { priority: 'Low', autoPriority: false }),
        download('debian-12.10.0-amd64-netinst.iso', 0.92),
        download('Sintel (2010) 4K - Blender Foundation.mkv', 0.37),
        download('Miguel de Cervantes - Don Quijote de la Mancha (Gutenberg #2000).epub', 0.0, { sources: 0, starved: true, status: 'Waiting', startKnown: false, addedAt: undefined }),
        download('planet-250825.osm.pbf', 0.008, { status: 'Paused' }),
        download('Bach - The Well-Tempered Clavier (Kimiko Ishizaka, CC0) FLAC.zip', 0.55, { status: 'Paused' }),
        download('LibriVox - Sherlock Holmes - The Adventures (audiobook) MP3.zip', 0.71),
        download('Fedora-Workstation-Live-x86_64-42-1.1.iso', 0.12)
    ];

    const sharedNames: Array<[string, number]> = [
        ['Big Buck Bunny (2008) 1080p 60fps - Blender Foundation.mp4', 14.2],
        ['ubuntu-24.04.2-desktop-amd64.iso', 3.6],
        ['linuxmint-22.1-cinnamon-64bit.iso', 2.1],
        ['wikipedia_en_simple_all_maxi_2025-07.zim', 5.8],
        ['Jane Austen - Pride and Prejudice (Gutenberg #1342).epub', 41],
        ['Mary Shelley - Frankenstein (Gutenberg #84).epub', 27],
        ['Tears of Steel (2012) 1080p - Blender Foundation.mp4', 6.3],
        ['LibreOffice_25.2.3_Win_x86-64.msi', 1.9],
        ['VLC media player 3.0.21 win64.exe', 9.4],
        ['Beethoven - Symphony No. 9 (Musopen, public domain FLAC).zip', 3.3],
        ['archlinux-2025.08.01-x86_64.iso', 1.2],
        ['spain-latest.osm.pbf', 0.8],
        ['Night of the Living Dead (1968) - public domain.mp4', 4.7],
        ['Lewis Carroll - Alice in Wonderland (Gutenberg #11).pdf', 18]
    ];
    const sharedFiles = sharedNames.map(([name, ratio], index) => shared(name, ratio, index));

    const servers: DemoServer[] = [
        { name: 'Demo Server One', ip: '192.0.2.10', port: 4661, description: 'The friendly one', users: 184_233, files: 61_402_118, ping: 38, priority: 'High', failed: 0, static: true, connected: true },
        { name: 'Open Harbour', ip: '198.51.100.24', port: 4242, description: 'Community run', users: 96_510, files: 22_871_004, ping: 71, priority: 'Normal', failed: 0, static: true, connected: false },
        { name: 'Lighthouse Relay', ip: '203.0.113.7', port: 5000, description: '', users: 42_003, files: 9_120_557, ping: 122, priority: 'Normal', failed: 1, static: false, connected: false },
        { name: 'Northern Index', ip: '192.0.2.201', port: 4661, description: 'Mirror of Open Harbour', users: 12_890, files: 3_330_124, priority: 'Low', failed: 0, static: false, connected: false },
        { name: 'Quiet Archive', ip: '198.51.100.99', port: 3306, description: 'Rarely answers', users: 0, files: 0, priority: 'Low', failed: 4, static: false, connected: false },
        { name: 'Meridian Hub', ip: '203.0.113.130', port: 4661, description: '', users: 58_770, files: 14_002_931, ping: 96, priority: 'Normal', failed: 0, static: false, connected: false }
    ];

    const preferences: AmulePreferences = {
        nickname: 'aMule Nuxt demo',
        userHash: 'DEADBEEF0E0DCAFE0F0DFACE0BADF00D',
        connection: {
            maxUpload: 640,
            maxDownload: 2600,
            uploadCapacity: 800,
            downloadCapacity: 3200,
            maxConnections: 500,
            maxSourcesPerFile: 300,
            tcpPort: 4662,
            udpPort: 4672,
            autoConnect: true,
            reconnect: true
        },
        servers: {
            removeDead: true,
            deadServerRetries: 3,
            autoUpdate: false,
            addFromServer: true,
            addFromClient: false,
            safeConnect: true,
            autoConnectStaticOnly: false,
            updateUrl: 'http://example.invalid/server.met'
        },
        directories: {
            incoming: '/home/demo/Incoming',
            temp: '/home/demo/Temp',
            shareHidden: false,
            autoRescan: false
        }
    };

    // A search that ran yesterday and an automatic one that has been running for hours
    const yesterday = now - hours(22);
    const searchSessions: StoredSearch[] = [{
        id: `demo-${yesterday.toString(36)}`,
        keyword: 'xubuntu',
        type: 'Kad',
        startedAt: yesterday,
        updatedAt: yesterday + 45_000,
        status: 'done',
        results: buildResultPool('xubuntu', 'Kad', 'seed')
    }];

    const autoCreated = now - hours(3);
    const autoResults = buildResultPool('wikipedia zim', 'Kad', 'auto-seed');
    const autoSearches: AutoSearch[] = [{
        id: 'auto-demo-wikipedia',
        keyword: 'wikipedia zim',
        networks: ['Kad', 'Global'],
        intervalMs: AUTO_DEFAULT_INTERVAL_MS,
        duration: '1d',
        createdAt: autoCreated,
        endsAt: autoCreated + hours(24),
        lastRunAt: now - 4 * 60_000,
        nextRunAt: now + 60_000,
        runs: 35,
        newLastRun: 1,
        status: 'active',
        results: autoResults.slice(0, Math.max(3, autoResults.length - 2))
    }];

    const logs = [
        `${timestamp(now - 3_600_000)}: aMule 2.3.3 (demo) started`,
        `${timestamp(now - 3_599_000)}: Loading temp files from /home/demo/Temp`,
        `${timestamp(now - 3_598_000)}: Loading ${sharedFiles.length} shared files`,
        `${timestamp(now - 3_590_000)}: Connecting to Demo Server One (192.0.2.10:4661)...`,
        `${timestamp(now - 3_587_000)}: Connected to Demo Server One with HighID`,
        `${timestamp(now - 3_580_000)}: Kademlia: connected, firewalled state: open`,
        `${timestamp(now - 2_900_000)}: Automatic search "wikipedia zim" (Kad): 4 new of 11 results`,
        `${timestamp(now - 1_200_000)}: Lost all sources for ${downloads[5]!.name}`,
        `${timestamp(now - 600_000)}: Automatic search "wikipedia zim" (Global): 0 new of 7 results`
    ];

    return {
        seededAt: now,
        startedAt: now,
        downloads,
        shared: sharedFiles,
        uploads: [],
        servers,
        ed2k: 'connected',
        ed2kSince: now - 3_587_000,
        kadRunning: true,
        kadConnected: true,
        kadFirewalled: false,
        clientId: 2_193_004_871,
        limits: { uploadLimit: 640, downloadLimit: 2600 },
        preferences,
        totals: { up: Math.round(391 * GB), down: Math.round(1.28 * 1024 * GB), sessionUp: 0, sessionDown: 0 },
        queuedClients: 9,
        logs,
        search: null,
        searchSessions,
        autoSearches
    };
}
