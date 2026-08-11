/**
 * A language model that runs entirely in this browser, and can operate aMule.
 *
 * Nothing typed here is sent anywhere: WebLLM compiles the model to WebGPU and
 * runs it on the local machine, and the only network traffic is the one-off
 * model download (cached by the browser afterwards) and the tool calls, which go
 * to this app's own MCP endpoint on the same origin.
 *
 * ## How the tools work
 *
 * Small models are inconsistent with OpenAI-style `tools` arguments - the
 * templates differ per model and half the useful small models have none. So the
 * protocol here is deliberately plain: the tools are described in the system
 * prompt and the model answers with a single JSON object when it wants to use
 * one. That works with every model WebLLM can run, and it is trivial to inspect
 * when it goes wrong.
 *
 * The loop is bounded (`MAX_TOOL_ROUNDS`) because a model that has decided to
 * call a tool over and over will otherwise do exactly that.
 */

import type { AssistantTool } from './useMcpTools';

export interface AssistantMessage {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    /** Set on tool messages, for the "used X" line in the transcript. */
    toolName?: string;
    /** Arguments the model passed, shown when a tool line is expanded. */
    toolArgs?: string;
    failed?: boolean;
}

export interface AssistantModel {
    id: string;
    /** Roughly how much video memory it needs, in MB, as WebLLM reports it. */
    vramMb?: number;
    /** True for the ones this app suggests first. */
    recommended: boolean;
}

/**
 * Models offered at the top of the list: small enough to download on a home
 * connection, good enough to follow the tool protocol below. The list is matched
 * against whatever the installed WebLLM version actually ships, so a renamed or
 * dropped model quietly stops being offered instead of breaking the page.
 */
const PREFERRED_MODELS = [
    'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    'Qwen2.5-7B-Instruct-q4f16_1-MLC',
    'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    'Hermes-3-Llama-3.1-8B-q4f16_1-MLC'
];

const MAX_TOOL_ROUNDS = 5;
/** Kept short: every message is re-read on each turn, and context is small. */
const MAX_HISTORY_MESSAGES = 24;

const STORAGE_KEY = 'amule.assistant.model';

function systemPrompt(tools: AssistantTool[]): string {
    const catalogue = tools.map(tool => {
        const properties = tool.inputSchema?.properties ?? {};
        const required: string[] = tool.inputSchema?.required ?? [];
        const args = Object.entries(properties)
            .map(([name, definition]: [string, any]) => {
                const type = definition?.type ?? 'string';
                const note = definition?.description ? ` - ${definition.description}` : '';
                return `    ${name} (${type}${required.includes(name) ? ', required' : ''})${note}`;
            })
            .join('\n');

        return `- ${tool.name}: ${tool.description}${args ? `\n${args}` : ''}`;
    }).join('\n');

    return [
        'You are the assistant built into aMule Nuxt, a web interface for an aMule peer-to-peer daemon.',
        'You help the user understand and control their downloads, uploads, shared files, servers and searches.',
        '',
        'You can call tools. To call one, reply with ONLY a JSON object, no other text:',
        '{"tool": "<tool name>", "arguments": { ... }}',
        '',
        'Rules for tools:',
        '- Call a tool whenever the answer depends on the current state of the daemon. Never guess numbers.',
        '- One tool per reply. You will be given its result and can then call another or answer.',
        '- Downloads are identified by a 32 character hex file hash, which amule-downloads returns.',
        '- Never call amule-download-remove, amule-server-remove, amule-server-control, amule-network or',
        '  amule-preferences unless the user has clearly asked for that exact change. These are destructive.',
        '- When you have what you need, answer in plain prose. Be brief and concrete: sizes, speeds, names.',
        '',
        'Tools available:',
        catalogue
    ].join('\n');
}

/**
 * Finds a tool call in a reply.
 *
 * Tolerant on purpose: a small model will wrap the JSON in prose, in a code
 * fence, or both. Anything that is not a well-formed call with a known-looking
 * shape is treated as an ordinary answer.
 */
export function parseToolCall(reply: string): { tool: string; arguments: Record<string, any> } | null {
    const withoutFence = reply.replace(/```(?:json)?/gi, '').trim();
    const start = withoutFence.indexOf('{');
    const end = withoutFence.lastIndexOf('}');

    if (start === -1 || end <= start) return null;

    try {
        const parsed = JSON.parse(withoutFence.slice(start, end + 1));
        if (typeof parsed?.tool !== 'string') return null;

        return {
            tool: parsed.tool,
            arguments: parsed.arguments && typeof parsed.arguments === 'object' ? parsed.arguments : {}
        };
    } catch {
        return null;
    }
}

export const useLocalAssistant = () => {
    const mcp = useMcpTools();

    const messages = useState<AssistantMessage[]>('assistant-messages', () => []);
    const models = useState<AssistantModel[]>('assistant-models', () => []);
    const modelId = useState<string>('assistant-model-id', () => '');
    const status = useState<'idle' | 'loading' | 'ready' | 'thinking'>('assistant-status', () => 'idle');
    const progress = useState<number>('assistant-progress', () => 0);
    const progressText = useState<string>('assistant-progress-text', () => '');
    const error = useState<string | null>('assistant-error', () => null);
    const supported = useState<boolean>('assistant-supported', () => false);
    /** False until the browser has been asked, so nothing is claimed during SSR. */
    const checked = useState<boolean>('assistant-checked', () => false);

    // The engine is a live object with a worker behind it: it must not go into
    // reactive state, or Vue proxies every internal it touches.
    const engineRef = useState<{ engine: any } | null>('assistant-engine', () => null);

    let cancelled = false;

    /**
     * WebGPU is the whole requirement. It is absent in Safari and Firefox at the
     * time of writing, and behind a flag on some Linux builds.
     */
    async function detect(): Promise<void> {
        if (import.meta.server) return;

        const gpu = (navigator as any).gpu;
        if (!gpu) {
            supported.value = false;
            checked.value = true;
            return;
        }

        try {
            // Having the API is not the same as having a usable adapter
            supported.value = Boolean(await gpu.requestAdapter());
        } catch {
            supported.value = false;
        } finally {
            checked.value = true;
        }

        if (!supported.value) return;

        const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
        const available = prebuiltAppConfig.model_list;

        const preferred = PREFERRED_MODELS
            .map(id => available.find(record => record.model_id === id))
            .filter(Boolean)
            .map(record => ({
                id: record!.model_id,
                vramMb: record!.vram_required_MB,
                recommended: true
            }));

        const rest = available
            .filter(record => !PREFERRED_MODELS.includes(record.model_id))
            .map(record => ({ id: record.model_id, vramMb: record.vram_required_MB, recommended: false }));

        models.value = [...preferred, ...rest];

        const stored = window.localStorage.getItem(STORAGE_KEY);
        modelId.value = (stored && available.some(record => record.model_id === stored) ? stored : '')
            || preferred[0]?.id
            || available[0]?.model_id
            || '';
    }

    /** Downloads (once) and compiles the chosen model. */
    async function load(): Promise<void> {
        if (!modelId.value || status.value === 'loading') return;

        status.value = 'loading';
        progress.value = 0;
        error.value = null;

        try {
            const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');

            const worker = new Worker(new URL('../workers/webllm.worker.ts', import.meta.url), {
                type: 'module'
            });

            const engine = await CreateWebWorkerMLCEngine(worker, modelId.value, {
                initProgressCallback: report => {
                    progress.value = Math.round((report.progress ?? 0) * 100);
                    progressText.value = report.text ?? '';
                }
            });

            engineRef.value = { engine };
            window.localStorage.setItem(STORAGE_KEY, modelId.value);

            // The tool list is read now so the first question does not pay for it
            await mcp.refresh();

            status.value = 'ready';
        } catch (e: any) {
            error.value = e?.message || 'The model could not be loaded';
            status.value = 'idle';
        }
    }

    async function unload(): Promise<void> {
        const engine = engineRef.value?.engine;
        engineRef.value = null;
        status.value = 'idle';
        progress.value = 0;

        try {
            await engine?.unload?.();
        } catch {
            // Nothing useful to do if the engine is already gone
        }
    }

    /** The conversation as the model sees it, trimmed to what fits. */
    function transcript(): Array<{ role: string; content: string }> {
        return messages.value
            .slice(-MAX_HISTORY_MESSAGES)
            .map(message => ({
                // A tool result is fed back as a user turn: it is context the model
                // did not write, and every chat template understands the role.
                role: message.role === 'assistant' ? 'assistant' : 'user',
                content: message.role === 'tool'
                    ? `Result of ${message.toolName}:\n${message.content}`
                    : message.content
            }));
    }

    async function complete(): Promise<string> {
        const engine = engineRef.value?.engine;
        if (!engine) throw new Error('No model is loaded');

        const response = await engine.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt(mcp.tools.value) },
                ...transcript()
            ],
            // Low, because the job here is following a protocol and reporting
            // numbers, not writing prose
            temperature: 0.2,
            max_tokens: 800
        });

        return response.choices?.[0]?.message?.content ?? '';
    }

    /**
     * One user turn: ask, run whatever tools the model asks for, answer.
     */
    async function ask(question: string): Promise<void> {
        const text = question.trim();
        if (!text || status.value === 'thinking') return;

        cancelled = false;
        messages.value = [...messages.value, { role: 'user', content: text }];
        status.value = 'thinking';
        error.value = null;

        try {
            for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
                if (cancelled) return;

                const reply = await complete();
                if (cancelled) return;

                const call = round < MAX_TOOL_ROUNDS ? parseToolCall(reply) : null;

                if (!call) {
                    messages.value = [...messages.value, { role: 'assistant', content: reply.trim() }];
                    return;
                }

                const result = await mcp.call(call.tool, call.arguments);

                messages.value = [...messages.value, {
                    role: 'tool',
                    toolName: call.tool,
                    toolArgs: JSON.stringify(call.arguments),
                    // Long tool output eats the whole context window on a small
                    // model, and the tail is rarely what matters
                    content: result.text.slice(0, 4000),
                    failed: !result.ok
                }];
            }
        } catch (e: any) {
            error.value = e?.message || 'The model could not answer';
        } finally {
            if (!cancelled) status.value = 'ready';
        }
    }

    /** Abandons the current turn. The engine finishes its token either way. */
    function stop(): void {
        cancelled = true;
        status.value = engineRef.value ? 'ready' : 'idle';
        try {
            engineRef.value?.engine?.interruptGenerate?.();
        } catch {
            // Interrupting is best effort
        }
    }

    function clear(): void {
        messages.value = [];
        error.value = null;
    }

    return {
        messages,
        models,
        modelId,
        status,
        progress,
        progressText,
        error,
        supported,
        checked,
        tools: mcp.tools,
        toolsError: mcp.error,
        detect,
        load,
        unload,
        ask,
        stop,
        clear
    };
};
