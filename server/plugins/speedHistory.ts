/**
 * Starts the rolling transfer-rate sampler with the server, so the statistics
 * page can show history from before the page was opened.
 */

import { startSpeedHistory, stopSpeedHistory } from '../utils/speedHistory';

export default defineNitroPlugin(nitroApp => {
    // The prerenderer (nuxt generate) loads every plugin too: a socket server or
    // a polling timer started here would keep that process alive forever.
    if (import.meta.prerender) return;

    startSpeedHistory();

    nitroApp.hooks.hook('close', () => {
        stopSpeedHistory();
    });
});
