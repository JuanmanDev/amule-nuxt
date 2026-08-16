/**
 * The tools the local assistant is allowed to use.
 *
 * Two sources, merged into one list:
 *
 *  * **This app's own MCP server** (`/mcp`), which already exposes everything the
 *    interface can do - the queue, uploads, shared files, servers, search, Kad
 *    and preferences. It is the same endpoint external agents connect to, so the
 *    assistant can never drift from what the app supports: add a tool there and
 *    it appears here.
 *  * **WebMCP**, the draft browser API where a page publishes tools for an agent
 *    running inside it (`navigator.modelContext`). Read defensively, because it
 *    is a moving target and absent in every shipping browser today.
 *
 * Everything runs in the browser against the same origin, which is what makes
 * "the model is local" true end to end: the conversation never leaves the
 * machine, and the tool calls go to the same server the page came from.
 */

export interface AssistantTool {
    name: string;
    description: string;
    /** JSON Schema for the arguments, as the model is shown it. */
    inputSchema: Record<string, any>;
    /** Where it came from, so the UI can say. */
    source: 'mcp' | 'webmcp';
}

export interface ToolResult {
    ok: boolean;
    /** Flattened text of the tool's response, which is what the model reads. */
    text: string;
}

/** Tools that change or destroy something, and are never called on a guess. */
const DESTRUCTIVE = new Set([
    'amule-download-remove',
    'amule-server-remove',
    'amule-server-control',
    'amule-preferences',
    'amule-network',
    // Deleting discards everything the search accumulated; stop/resume ride along
    'amule-auto-search-control'
]);

export function isDestructiveTool(name: string): boolean {
    return DESTRUCTIVE.has(name);
}

const MCP_URL = '/mcp';
const PROTOCOL_VERSION = '2025-06-18';

let nextId = 1;
/** Returned by servers that keep session state; sent back on every later call. */
let sessionId: string | null = null;
let initialised = false;

async function rpc(method: string, params: Record<string, any> = {}): Promise<any> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        // Streamable HTTP servers may answer either way; both are handled below
        Accept: 'application/json, text/event-stream'
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const response = await fetch(MCP_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params })
    });

    const returned = response.headers.get('Mcp-Session-Id');
    if (returned) sessionId = returned;

    if (!response.ok) {
        throw new Error(`MCP ${method} failed: ${response.status} ${response.statusText}`);
    }

    const body = await response.text();
    const payload = body.startsWith('event:') || body.startsWith('data:')
        // Server-sent events: the JSON is on the last data: line
        ? JSON.parse(body.split('\n').filter(line => line.startsWith('data:')).pop()!.slice(5).trim())
        : JSON.parse(body);

    if (payload.error) {
        throw new Error(payload.error.message || `MCP ${method} failed`);
    }

    return payload.result;
}

async function initialise(): Promise<void> {
    if (initialised) return;

    await rpc('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'aMule Nuxt local assistant', version: '1' }
    });

    initialised = true;
}

/** Tools published by the page itself, if this browser supports WebMCP at all. */
function webMcpTools(): AssistantTool[] {
    const provider = (globalThis.navigator as any)?.modelContext;
    const registered = provider?.registeredTools ?? provider?.tools;

    if (!Array.isArray(registered)) return [];

    return registered
        .filter((tool: any) => typeof tool?.name === 'string')
        .map((tool: any) => ({
            name: tool.name,
            description: tool.description ?? '',
            inputSchema: tool.inputSchema ?? tool.input_schema ?? { type: 'object', properties: {} },
            source: 'webmcp' as const
        }));
}

async function callWebMcp(name: string, args: Record<string, any>): Promise<ToolResult> {
    const provider = (globalThis.navigator as any)?.modelContext;
    const registered = provider?.registeredTools ?? provider?.tools ?? [];
    const tool = registered.find((entry: any) => entry?.name === name);

    if (typeof tool?.execute !== 'function' && typeof tool?.callback !== 'function') {
        return { ok: false, text: `No WebMCP tool named ${name} can be called here.` };
    }

    const run = tool.execute ?? tool.callback;
    const result = await run.call(tool, args);

    return { ok: true, text: flatten(result) };
}

/** MCP results are a list of typed parts; the model only reads text. */
function flatten(result: any): string {
    if (typeof result === 'string') return result;

    const parts = result?.content;
    if (!Array.isArray(parts)) return JSON.stringify(result ?? null);

    return parts
        .map((part: any) => (part?.type === 'text' ? part.text : JSON.stringify(part)))
        .join('\n');
}

export const useMcpTools = () => {
    const tools = useState<AssistantTool[]>('assistant-tools', () => []);
    const error = useState<string | null>('assistant-tools-error', () => null);
    const loading = useState<boolean>('assistant-tools-loading', () => false);

    async function refresh(): Promise<AssistantTool[]> {
        loading.value = true;
        try {
            await initialise();
            const result = await rpc('tools/list');

            const mcp: AssistantTool[] = (result?.tools ?? []).map((tool: any) => ({
                name: tool.name,
                description: tool.description ?? '',
                inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
                source: 'mcp' as const
            }));

            tools.value = [...mcp, ...webMcpTools()];
            error.value = null;
        } catch (e: any) {
            error.value = e?.message || 'Could not read the tool list';
            tools.value = webMcpTools();
        } finally {
            loading.value = false;
        }

        return tools.value;
    }

    /**
     * Runs one tool. A failure is reported *to the model* rather than thrown, so
     * it can correct a wrong argument and try again instead of the conversation
     * ending on an exception.
     */
    async function call(name: string, args: Record<string, any>): Promise<ToolResult> {
        const tool = tools.value.find(entry => entry.name === name);

        if (!tool) {
            return { ok: false, text: `There is no tool named "${name}". Use one of: ${tools.value.map(entry => entry.name).join(', ')}` };
        }

        try {
            if (tool.source === 'webmcp') return await callWebMcp(name, args);

            await initialise();
            const result = await rpc('tools/call', { name, arguments: args ?? {} });

            return { ok: !result?.isError, text: flatten(result) };
        } catch (e: any) {
            return { ok: false, text: `The tool "${name}" failed: ${e?.message || e}` };
        }
    }

    return { tools, error, loading, refresh, call };
};
