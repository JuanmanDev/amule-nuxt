/**
 * POST /api/assistant/chat
 * Forwards one chat completion to an OpenAI-compatible endpoint.
 *
 * The assistant can, besides running a model in the browser, talk to Ollama
 * (local or remote) or any OpenAI-compatible cloud API. The browser cannot call
 * those directly - Ollama refuses cross-origin requests unless configured for
 * them, and most cloud APIs refuse browsers outright - so this endpoint relays
 * the request. The API key travels with each request and is never stored here.
 *
 * Body: { baseUrl, apiKey?, model, messages, temperature?, maxTokens? }
 */

import type { ApiResponse } from '../../../shared/types/api';

/** Generous: a large model on a small machine takes its time. */
const TIMEOUT_MS = 180 * 1000;

export function normalizeBaseUrl(raw: string): string | null {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        return null;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    return url.href.replace(/\/+$/, '');
}

export default defineEventHandler(async (event): Promise<ApiResponse<{ content: string }>> => {
    try {
        const body = await readBody(event);

        const baseUrl = typeof body?.baseUrl === 'string' ? normalizeBaseUrl(body.baseUrl) : null;
        if (!baseUrl) {
            return { success: false, error: 'A valid http(s) endpoint URL is required' };
        }
        if (typeof body?.model !== 'string' || !body.model.trim()) {
            return { success: false, error: 'A model name is required' };
        }
        if (!Array.isArray(body?.messages) || body.messages.length === 0) {
            return { success: false, error: 'A conversation is required' };
        }

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
            headers.Authorization = `Bearer ${body.apiKey.trim()}`;
        }

        const response = await $fetch<any>(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            timeout: TIMEOUT_MS,
            body: {
                model: body.model.trim(),
                messages: body.messages,
                temperature: typeof body.temperature === 'number' ? body.temperature : 0.2,
                max_tokens: typeof body.maxTokens === 'number' ? body.maxTokens : 800,
                stream: false
            }
        });

        const content = response?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') {
            return { success: false, error: 'The endpoint answered without a message' };
        }

        return { success: true, data: { content } };
    } catch (error: any) {
        // Surface the upstream's own words when it sent any: "invalid api key"
        // beats "request failed with status 401"
        const upstream = error?.data?.error?.message || error?.data?.error || error?.message;
        return { success: false, error: typeof upstream === 'string' ? upstream : 'The endpoint could not be reached' };
    }
});
