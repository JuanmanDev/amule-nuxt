/**
 * Starts the automatic-search runner with the server, so scheduled searches
 * keep running with every browser closed — which is their whole point.
 */

import { startAutoSearchRunner, stopAutoSearchRunner } from '../utils/autoSearchRunner';

export default defineNitroPlugin(nitroApp => {
    // The prerenderer (nuxt generate) loads every plugin too: a socket server or
    // a polling timer started here would keep that process alive forever.
    if (import.meta.prerender) return;

    startAutoSearchRunner();

    nitroApp.hooks.hook('close', () => {
        stopAutoSearchRunner();
    });
});
