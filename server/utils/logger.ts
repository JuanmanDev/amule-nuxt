/**
 * Application logging.
 *
 * The level is chosen automatically: verbose while developing, quiet in
 * production, and always overridable with LOG_LEVEL so a deployed instance can
 * be turned up temporarily without a rebuild.
 *
 * Levels follow consola: 0 fatal/error, 1 warn, 2 log, 3 info, 4 debug, 5 trace.
 */

import { createConsola, type ConsolaInstance, type LogLevel } from 'consola';

const NAMED_LEVELS: Record<string, LogLevel> = {
    silent: -999,
    fatal: 0,
    error: 0,
    warn: 1,
    log: 2,
    info: 3,
    debug: 4,
    trace: 5,
    verbose: 5
};

function resolveLevel(): LogLevel {
    const configured = process.env.LOG_LEVEL?.trim().toLowerCase();

    if (configured) {
        if (configured in NAMED_LEVELS) return NAMED_LEVELS[configured]!;

        const numeric = Number(configured);
        if (Number.isFinite(numeric)) return numeric as LogLevel;
    }

    // No explicit setting: debug while developing, warnings only in production
    return isDevelopment() ? NAMED_LEVELS.debug! : NAMED_LEVELS.warn!;
}

/** True for `nuxt dev` and for NODE_ENV=development. */
export function isDevelopment(): boolean {
    return Boolean(import.meta.dev) || process.env.NODE_ENV === 'development';
}

const root: ConsolaInstance = createConsola({
    level: resolveLevel(),
    formatOptions: {
        // Timestamps matter in production logs, colours only help a terminal
        date: !isDevelopment(),
        colors: isDevelopment(),
        compact: !isDevelopment()
    }
});

/**
 * Logger for one subsystem, e.g. `useLogger('amule-ec')`.
 * Tags make it obvious where a line came from once several subsystems log.
 */
export function useLogger(tag: string): ConsolaInstance {
    return root.withTag(tag);
}

export const logger = root;

/** Current level, exposed for the diagnostics endpoint. */
export function currentLogLevel(): { level: number; source: 'LOG_LEVEL' | 'environment'; environment: 'development' | 'production' } {
    return {
        level: root.level,
        source: process.env.LOG_LEVEL ? 'LOG_LEVEL' : 'environment',
        environment: isDevelopment() ? 'development' : 'production'
    };
}
