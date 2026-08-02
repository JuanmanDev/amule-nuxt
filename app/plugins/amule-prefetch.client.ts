/**
 * Keeps the download, upload and shared-file feeds warm for the whole session.
 *
 * Living in a plugin rather than in a page means the loops survive navigation:
 * whichever page the user opens next already has data to render, so there is no
 * skeleton flash and no waiting for the daemon. Cadence and the in-flight guards
 * are in `useAmuleFeeds`.
 */

export default defineNuxtPlugin(() => {
    const stop = startFeedPrefetch();

    if (import.meta.hot) {
        // Without this a dev-server reload leaves the previous timer polling.
        import.meta.hot.dispose(() => stop());
    }
});
