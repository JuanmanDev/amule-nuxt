/**
 * Shared utility to get AmuleECClient instance
 * Replaces the old AmuleCmdClient
 */

import { AmuleECClient } from '../utils/amule-ec/AmuleECClient';

let ecClientInstance: AmuleECClient | null = null;

/**
 * Get the aMule EC Client instance
 * @returns AmuleECClient
 */
export function getAmuleClient(): AmuleECClient {
    const config = useRuntimeConfig();

    const host = process.env.AMULE_EC_HOST || config.amuleEcHost || 'localhost';
    const port = process.env.AMULE_EC_PORT || config.amuleEcPort || 4712;
    const password = process.env.AMULE_EC_PASSWORD || config.amuleEcPassword || '';

    if (!ecClientInstance) {
        ecClientInstance = new AmuleECClient({
            host: host as string,
            port: Number(port),
            password: password as string
        });
    }

    return ecClientInstance;
}

/**
 * Alias for getAmuleClient to maintain compatibility if used elsewhere
 */
export const getAmuleECClient = getAmuleClient;
