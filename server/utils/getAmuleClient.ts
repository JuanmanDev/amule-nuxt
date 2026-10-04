/**
 * The aMule client every route, the live monitor and the MCP tools share.
 *
 * It is an `AmuleBackend`: amuleapi (aMule 3.1's REST daemon) when configured,
 * with the External Connection as the fallback - see `amule-backend.ts`.
 *
 * EC:       AMULE_EC_HOST / AMULE_EC_PORT (4712) / AMULE_EC_PASSWORD
 * amuleapi: AMULE_API_HOST (defaults to the EC host) / AMULE_API_PORT (4713) /
 *           AMULE_API_PASSWORD - empty leaves amuleapi off
 * Choice:   AMULE_BACKEND = auto (default) | amuleapi | ec
 *
 * The environment is read before runtimeConfig on purpose: the values baked
 * into runtimeConfig are the build's, and a container started with different
 * variables must connect where it was told to.
 */

import { AmuleECClient } from './amule-ec/AmuleECClient';
import { AmuleApiClient } from './amule-api/AmuleApiClient';
import { AmuleBackend, resolveBackendMode } from './amule-backend';

/** amuleapi's default HTTP port in a stock aMule 3.1. */
export const DEFAULT_AMULE_API_PORT = 4713;
export const DEFAULT_AMULE_EC_PORT = 4712;

let backendInstance: AmuleBackend | null = null;

export interface AmuleConnectionSettings {
    mode: ReturnType<typeof resolveBackendMode>;
    ec: { host: string; port: number; password: string };
    api: { host: string; port: number; password: string };
}

/** Where both links point, environment first. Shared with the diagnostics route. */
export function amuleConnectionSettings(): AmuleConnectionSettings {
    const config = useRuntimeConfig();

    const ecHost = String(process.env.AMULE_EC_HOST || config.amuleEcHost || 'localhost');

    return {
        mode: resolveBackendMode(process.env.AMULE_BACKEND || config.amuleBackend),
        ec: {
            host: ecHost,
            port: Number(process.env.AMULE_EC_PORT || config.amuleEcPort || DEFAULT_AMULE_EC_PORT),
            password: String(process.env.AMULE_EC_PASSWORD || config.amuleEcPassword || '')
        },
        api: {
            // amuleapi normally runs next to amuled, so the EC host is the
            // sensible default rather than localhost.
            host: String(process.env.AMULE_API_HOST || config.amuleApiHost || ecHost),
            port: Number(process.env.AMULE_API_PORT || config.amuleApiPort || DEFAULT_AMULE_API_PORT),
            password: String(process.env.AMULE_API_PASSWORD || config.amuleApiPassword || '')
        }
    };
}

/**
 * Get the aMule client.
 * @returns AmuleBackend - amuleapi first, EC as the fallback
 */
export function getAmuleClient(): AmuleBackend {
    if (!backendInstance) {
        const settings = amuleConnectionSettings();

        const ec = new AmuleECClient(settings.ec);
        const api = new AmuleApiClient(settings.api);

        backendInstance = new AmuleBackend(ec, api, settings.mode, {
            configured: Boolean(settings.ec.password),
            address: `${settings.ec.host}:${settings.ec.port}`
        });
    }

    return backendInstance;
}

/**
 * Alias kept for the routes written before amuleapi existed. It returns the
 * same backend: nothing outside `amule-backend.ts` needs EC specifically.
 */
export const getAmuleECClient = getAmuleClient;
