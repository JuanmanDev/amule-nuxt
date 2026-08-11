import { describe, it, expect } from 'vitest';
import { parseToolCall } from '../app/composables/useLocalAssistant';

/**
 * The tool protocol is the one thing between the model and a daemon that can
 * delete files, so what does and does not count as a call is worth pinning down.
 * Every input below is something a small instruct model actually produces.
 */
describe('parseToolCall', () => {
    it('reads a bare call', () => {
        expect(parseToolCall('{"tool":"amule-downloads","arguments":{}}'))
            .toEqual({ tool: 'amule-downloads', arguments: {} });
    });

    it('reads a call wrapped in a code fence', () => {
        const reply = '```json\n{"tool": "amule-status", "arguments": {}}\n```';
        expect(parseToolCall(reply)?.tool).toBe('amule-status');
    });

    it('reads a call the model introduced with prose', () => {
        const reply = 'Let me check the queue.\n{"tool": "amule-downloads", "arguments": {}}';
        expect(parseToolCall(reply)?.tool).toBe('amule-downloads');
    });

    it('keeps the arguments', () => {
        const call = parseToolCall('{"tool":"amule-search","arguments":{"keyword":"ubuntu","type":"Kad"}}');
        expect(call?.arguments).toEqual({ keyword: 'ubuntu', type: 'Kad' });
    });

    it('treats a plain answer as an answer', () => {
        expect(parseToolCall('You have 18 downloads, 2 of them active.')).toBeNull();
    });

    it('treats an answer that merely mentions braces as an answer', () => {
        expect(parseToolCall('Use the {hash} placeholder in the link.')).toBeNull();
    });

    it('refuses an object that is not a tool call', () => {
        expect(parseToolCall('{"answer": "42"}')).toBeNull();
    });

    it('refuses malformed JSON rather than guessing', () => {
        expect(parseToolCall('{"tool": "amule-downloads", arguments: }')).toBeNull();
    });

    it('defaults missing arguments to an empty object', () => {
        expect(parseToolCall('{"tool":"amule-status"}')?.arguments).toEqual({});
    });

    it('ignores arguments that are not an object', () => {
        expect(parseToolCall('{"tool":"amule-status","arguments":"none"}')?.arguments).toEqual({});
    });
});
