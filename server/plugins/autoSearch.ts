/**
 * Starts the automatic-search runner with the server, so scheduled searches
 * keep running with every browser closed — which is their whole point.
 */

import { startAutoSearchRunner, stopAutoSearchRunner } from '../utils/autoSearchRunner';

export default defineNitroPlugin(nitroApp => {
    startAutoSearchRunner();

    nitroApp.hooks.hook('close', () => {
        stopAutoSearchRunner();
    });
});
