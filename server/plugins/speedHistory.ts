/**
 * Starts the rolling transfer-rate sampler with the server, so the statistics
 * page can show history from before the page was opened.
 */

import { startSpeedHistory, stopSpeedHistory } from '../utils/speedHistory';

export default defineNitroPlugin(nitroApp => {
    startSpeedHistory();

    nitroApp.hooks.hook('close', () => {
        stopSpeedHistory();
    });
});
