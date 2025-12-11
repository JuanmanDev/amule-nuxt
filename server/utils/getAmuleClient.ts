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

    if (!ecClientInstance) {
        ecClientInstance = new AmuleECClient({
            host: config.amuleEcHost,
            port: config.amuleEcPort,
            password: config.amuleEcPassword
        });
    }

    return ecClientInstance;
}

/**
 * Alias for getAmuleClient to maintain compatibility if used elsewhere
 */
export const getAmuleECClient = getAmuleClient;
