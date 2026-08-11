/**
 * The worker the language model actually runs in.
 *
 * Generation is a tight loop over WebGPU; on the main thread it makes the page
 * stutter every time a token arrives - scrolling, the progress bars and the live
 * queue updates all compete with it. WebLLM ships a handler that speaks to the
 * engine across a worker boundary, so this file is the whole worker.
 */

import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (event: MessageEvent) => {
    handler.onmessage(event);
};
