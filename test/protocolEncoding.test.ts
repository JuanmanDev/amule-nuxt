import { describe, it, expect } from 'vitest';
import { AMuleProtocol, ECOpCodes, ECTagNames } from '../server/utils/amule-ec/lib/AMuleProtocol';

/**
 * EC transports strings as UTF-8. Writing them as Latin-1, or sizing the tag by
 * JavaScript character count, desynchronises the packet: aMule then answers
 * "Invalid link or already on list" for any link containing an accent.
 */
function buildStringTag(value: string): Uint8Array {
    const protocol = new AMuleProtocol({ host: 'localhost', port: 4712, password: 'x' }) as any;
    protocol.setHeadersToRequest(ECOpCodes.EC_OP_NOOP);
    protocol.buildTagArrayBuffer(ECTagNames.EC_TAG_STRING * 2, ECOpCodes.EC_OP_STRINGS, value, null);
    return new Uint8Array(protocol.finalizeRequest(1));
}

/** Tag layout: name (2) + type (1) + length (4) + payload. */
function readTag(packet: Uint8Array) {
    // 4 bytes flags + 4 bytes body length + 1 opcode + 2 tag count = 11
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    const declaredLength = view.getUint32(11 + 3, false);
    const payload = packet.slice(11 + 7, 11 + 7 + declaredLength);
    return { declaredLength, payload };
}

describe('string tag encoding', () => {
    it('writes plain ASCII unchanged', () => {
        const { declaredLength, payload } = readTag(buildStringTag('abc\0'));
        expect(declaredLength).toBe(4);
        expect(Buffer.from(payload).toString('utf8')).toBe('abc\0');
    });

    it('encodes accented characters as UTF-8 and counts bytes, not characters', () => {
        const text = 'días\0';
        const { declaredLength, payload } = readTag(buildStringTag(text));

        // 5 characters, 6 bytes: the tag length must be the byte count
        expect(text.length).toBe(5);
        expect(declaredLength).toBe(6);
        expect(Buffer.from(payload).toString('utf8')).toBe(text);
        // í is C3 AD in UTF-8, not the single Latin-1 byte ED
        expect(Array.from(payload)).toContain(0xc3);
        expect(Array.from(payload)).not.toContain(0xed);
    });

    it('handles three and four byte sequences', () => {
        for (const text of ['中文\0', '🚀\0', 'Rick-fu-sión.mkv\0']) {
            const expected = Buffer.from(text, 'utf8');
            const { declaredLength, payload } = readTag(buildStringTag(text));

            expect(declaredLength).toBe(expected.byteLength);
            expect(Buffer.from(payload).equals(expected)).toBe(true);
        }
    });

    it('keeps the declared body length in sync with the real packet size', () => {
        const packet = buildStringTag('Ricks.días,.siete.noches.mkv\0');
        const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);

        // Header declares everything after the first 8 bytes
        expect(view.getUint32(4, false)).toBe(packet.byteLength - 8);
    });
});
