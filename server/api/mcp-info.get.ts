/**
 * GET /api/mcp-info
 * Describes the MCP server this app exposes, including the tools it advertises.
 *
 * The tool list is read from the MCP endpoint itself (tools/list), so the page can
 * never drift from what agents actually see.
 */

import type { ApiResponse } from '../../shared/types/api';

export interface McpToolInfo {
    name: string;
    title?: string;
    description?: string;
    /** Names of the tool's input parameters, in schema order. */
    parameters: Array<{ name: string; required: boolean; description?: string }>;
}

export interface McpInfo {
    name: string;
    version: string;
    description?: string;
    instructions?: string;
    /** Path the MCP endpoint is served on. */
    route: string;
    /** Absolute URL, built from the incoming request. */
    url: string;
    protocolVersion?: string;
    tools: McpToolInfo[];
}

function describeParameters(schema: any): McpToolInfo['parameters'] {
    const properties = schema?.properties ?? {};
    const required: string[] = schema?.required ?? [];

    return Object.entries(properties).map(([name, definition]: [string, any]) => ({
        name,
        required: required.includes(name),
        description: definition?.description
    }));
}

export default defineEventHandler(async (event): Promise<ApiResponse<McpInfo>> => {
    const route = '/mcp';

    try {
        const origin = getRequestURL(event).origin;
        const call = (body: object) => $fetch<any>(route, {
            baseURL: origin,
            method: 'POST',
            headers: { accept: 'application/json, text/event-stream' },
            body
        });

        const [initialize, list] = await Promise.all([
            call({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-06-18',
                    capabilities: {},
                    clientInfo: {
                        name: 'amule-nuxt-ui',
                        version: String(useRuntimeConfig().public.appVersion ?? '0.0.0')
                    }
                }
            }),
            call({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
        ]);

        const serverInfo = initialize?.result?.serverInfo ?? {};
        const tools: McpToolInfo[] = (list?.result?.tools ?? []).map((tool: any) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            parameters: describeParameters(tool.inputSchema)
        }));

        return {
            success: true,
            data: {
                name: serverInfo.name ?? 'aMule Nuxt',
                version: serverInfo.version ?? 'unknown',
                description: serverInfo.description,
                instructions: initialize?.result?.instructions,
                protocolVersion: initialize?.result?.protocolVersion,
                route,
                url: `${origin}${route}`,
                tools
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Could not reach the MCP endpoint' };
    }
});
