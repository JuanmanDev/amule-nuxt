/**
 * GET /api/diagnostics
 * Runtime information useful when something misbehaves in a deployment:
 * which environment the server thinks it is in and how verbose it logs.
 */

import type { ApiResponse } from '../../shared/types/api';
import { currentLogLevel } from '../utils/logger';

export interface Diagnostics {
    /** Release this build came from, as stamped by semantic-release. */
    appVersion: string;
    environment: 'development' | 'production';
    logLevel: number;
    logLevelSource: 'LOG_LEVEL' | 'environment';
    nodeVersion: string;
    /** Seconds this server process has been running. */
    uptime: number;
    amule: {
        host: string;
        port: string | number;
    };
}

export default defineEventHandler(async (): Promise<ApiResponse<Diagnostics>> => {
    const config = useRuntimeConfig();
    const level = currentLogLevel();

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
                // Read the environment first, exactly as getAmuleClient does: the
                // values baked into runtimeConfig.public are the ones from build
                // time, so a container started with AMULE_EC_PORT=… would
                // otherwise be reported connecting to the wrong port.
                host: String(process.env.AMULE_EC_HOST || config.public.amuleEcHost || ''),
                port: process.env.AMULE_EC_PORT || config.public.amuleEcPort || ''
            }
        }
    };
});
