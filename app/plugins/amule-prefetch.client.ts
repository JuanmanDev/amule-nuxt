/**
 * Keeps the download, upload and shared-file feeds warm for the whole session,
 * and owns the live socket that fills the download queue.
 *
 * Living in a plugin rather than in a page means both survive navigation:
 * whichever page the user opens next already has data to render, so there is no
 * skeleton flash and no waiting for the daemon. Cadence and the in-flight guards
 * are in `useAmuleFeeds`; the socket's own reconnect logic is in
 * `useAmuleSocket`.
 */

export default defineNuxtPlugin(() => {
    const stop = startFeedPrefetch();
    // One socket for the session. Opened here so navigating between pages never
    // tears it down and replays a snapshot over the queue.
    openAmuleSocket();

    if (import.meta.hot) {
        // Without this a dev-server reload leaves the previous timer polling and
        // the previous socket pushing into a stale app instance.
        import.meta.hot.dispose(() => {
            stop();
            closeAmuleSocket();
        });
    }
});
