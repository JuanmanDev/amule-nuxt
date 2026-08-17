/**
 * POST /api/assistant/models
 * Lists the models an OpenAI-compatible endpoint offers (GET {base}/models).
 *
 * A POST although it only reads, because the API key must not end up in a URL
 * or a server log. Relayed for the same reason as /api/assistant/chat: the
 * browser cannot ask Ollama or a cloud API directly.
 */

import type { ApiResponse } from '../../../shared/types/api';
import { normalizeBaseUrl } from './chat.post';

export default defineEventHandler(async (event): Promise<ApiResponse<{ models: string[] }>> => {
    try {
        const body = await readBody(event);

        const baseUrl = typeof body?.baseUrl === 'string' ? normalizeBaseUrl(body.baseUrl) : null;
        if (!baseUrl) {
            return { success: false, error: 'A valid http(s) endpoint URL is required' };
        }

        const headers: Record<string, string> = {};
        if (typeof body?.apiKey === 'string' && body.apiKey.trim()) {
            headers.Authorization = `Bearer ${body.apiKey.trim()}`;
        }

        const response = await $fetch<any>(`${baseUrl}/models`, { headers, timeout: 20_000 });

        const models = (Array.isArray(response?.data) ? response.data : [])
            .map((entry: any) => entry?.id)
            .filter((id: unknown): id is string => typeof id === 'string')
            .sort();

        return { success: true, data: { models } };
    } catch (error: any) {
        const upstream = error?.data?.error?.message || error?.data?.error || error?.message;
        return { success: false, error: typeof upstream === 'string' ? upstream : 'The endpoint could not be reached' };
    }
});
