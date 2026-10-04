/**
 * GET /api/diagnostics
 * Runtime information useful when something misbehaves in a deployment:
 * which environment the server thinks it is in, how verbose it logs, and which
 * link to aMule is answering - amuleapi, EC, or neither.
 */

import type { ApiResponse } from '../../shared/types/api';
import { currentLogLevel } from '../utils/logger';
import { historyDiagnostics } from '../utils/downloadHistory';
import type { BackendInfo } from '../utils/amule-backend';

export interface Diagnostics {
    /** Release this build came from, as stamped by semantic-release. */
    appVersion: string;
    environment: 'development' | 'production';
    logLevel: number;
    logLevelSource: 'LOG_LEVEL' | 'environment';
    nodeVersion: string;
    /** Seconds this server process has been running. */
    uptime: number;
    /** The External Connection endpoint. */
    amule: {
        host: string;
        port: string | number;
    };
    /** Which link answers, and how each one is doing. */
    backend: BackendInfo & {
        /** amuleapi's own answer, when it is configured. */
        amuleapiProbe: {
            reachable: boolean;
            ecConnected: boolean | null;
            amuleapiVersion: string | null;
            daemonVersion: string | null;
            updateAvailable: boolean | null;
            latestVersion: string | null;
            error: string | null;
        } | null;
    };
    /** The download-history store: where the "in the queue since" dates live. */
    history: {
        path: string;
        entries: number;
        oldestFirstSeenAt: number | null;
        writeError: string | null;
    };
}

export default defineEventHandler(async (): Promise<ApiResponse<Diagnostics>> => {
    const config = useRuntimeConfig();
    const level = currentLogLevel();
    const settings = amuleConnectionSettings();
    const client = getAmuleClient();

    const probe = await client.probeApi().catch(() => null);

    return {
        success: true,
        data: {
            appVersion: String(config.public.appVersion ?? 'unknown'),
            environment: level.environment,
            logLevel: level.level,
            logLevelSource: level.source,
            nodeVersion: process.version,
            uptime: Math.round(process.uptime()),
            amule: {
                host: settings.ec.host,
                port: settings.ec.port
            },
            backend: {
                ...client.info(),
                amuleapiProbe: probe && {
                    reachable: probe.health !== null,
                    ecConnected: probe.health?.ec_connected ?? null,
                    amuleapiVersion: probe.version?.amuleapi_version ?? null,
                    daemonVersion: probe.version?.daemon_version || null,
                    updateAvailable: probe.version?.update?.available ?? null,
                    latestVersion: probe.version?.update?.latest_version ?? null,
                    error: probe.error
                }
            },
            history: await historyDiagnostics()
        }
    };
});
