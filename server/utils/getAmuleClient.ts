/**
 * Shared utility to get AmuleCmdClient instance
 * Uses runtime config for connection settings
 */

import { createAmuleClient } from '../utils/amulecmd/AmuleCmdClient';
import type { AmuleCmdClient } from '../utils/amulecmd/AmuleCmdClient';
import { AmuleECClient } from '../utils/amule-ec/AmuleECClient';

let clientInstance: AmuleCmdClient | null = null;
let ecClientInstance: AmuleECClient | null = null;

export function getAmuleClient(): AmuleCmdClient {
    const config = useRuntimeConfig();

    if (!clientInstance) {
        clientInstance = createAmuleClient({
            host: config.amuleEcHost,
            port: config.amuleEcPort,
            password: config.amuleEcPassword,
            executablePath: config.amuleCmdPath
        });
    }

    return clientInstance;
}

export function getAmuleECClient(): AmuleECClient {
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
