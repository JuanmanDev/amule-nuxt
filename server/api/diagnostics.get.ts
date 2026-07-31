/**
 * GET /api/diagnostics
 * Runtime information useful when something misbehaves in a deployment:
 * which environment the server thinks it is in and how verbose it logs.
 */

import type { ApiResponse } from '../../shared/types/api';
import { currentLogLevel } from '../utils/logger';

export interface Diagnostics {
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
            environment: level.environment,
            logLevel: level.level,
            logLevelSource: level.source,
            nodeVersion: process.version,
            uptime: Math.round(process.uptime()),
            amule: {
                host: String(config.public.amuleEcHost ?? ''),
                port: config.public.amuleEcPort ?? ''
            }
        }
    };
});
