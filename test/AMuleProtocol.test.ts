import { describe, it, expect, vi } from 'vitest';
import { AMuleProtocol, ECOpCodes, ECCodes } from '../server/utils/amule-ec/lib/AMuleProtocol';
import * as crypto from 'crypto';

const md5Hex = (input: string) => crypto.createHash('md5').update(input).digest('hex');

// Mock net module
vi.mock('net', () => {
  return {
    Socket: vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      write: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      destroy: vi.fn(),
      end: vi.fn(),
      removeListener: vi.fn(),
    })),
  };
});

describe('AMuleProtocol', () => {
    it('should initialize correctly', () => {
        const config = {
            host: 'localhost',
            port: 4712,
            password: 'test'
        };
        const protocol = new AMuleProtocol(config);
        expect(protocol).toBeDefined();
        // Since we cannot easily access private properties, we trust constructor works
    });

    it('should build correct auth request 1', () => {
        const config = { host: 'localhost', port: 4712, password: 'test' };
        const protocol = new AMuleProtocol(config);

        // Access private method for testing via casting to any
        const req = (protocol as any).getAuthRequest1();

        expect(req).toBeInstanceOf(ArrayBuffer);
        const view = new DataView(req);

        // Header check
        // Flags: 32 (0x20)
        expect(view.getUint32(0, false)).toBe(32);

        // OpCode: EC_OP_AUTH_REQ (0x02)
        // Offset: 4 (flags) + 4 (length) = 8.
        // Wait, my finalizeRequest logic writes length at offset 4, then opcode at offset 8?
        // Let's check `setHeadersToRequest` and `finalizeRequest` in AMuleProtocol.ts

        // setHeadersToRequest:
        // push 4 bytes (flags)
        // push 4 bytes (len placeholder)
        // push 1 byte (opcode)
        // push 2 bytes (tag count placeholder)

        // finalizeRequest:
        // writes len at offset 4
        // writes tag count at offset 4+4+1 = 9

        // So OpCode is at offset 8.
        expect(view.getUint8(8)).toBe(ECCodes.EC_OP_AUTH_REQ);
    });

    it('should build auth request 2 with MD5(passwordHash + MD5(saltHexString))', () => {
      const config = { host: 'localhost', port: 4712, password: 'mule' };
      const protocol = new AMuleProtocol(config);

      // aMule sends the salt as an uppercase hex string and hashes that string
      (protocol as any).salt = '0011223344556677';

      // Expected: MD5( md5hex(password) + md5hex(saltAsString) )
      const expected = md5Hex(md5Hex('mule') + md5Hex('0011223344556677'));

      // Get the request buffer and extract the hash bytes
      const req2 = (protocol as any).getAuthRequest2();
      expect(req2).toBeInstanceOf(ArrayBuffer);
      const view = new Uint8Array(req2 as ArrayBuffer);

      // Extract the 16 bytes content starting at offset 18
      const contentBytes = view.slice(18, 18 + 16);
      const contentHex = Buffer.from(contentBytes).toString('hex');
      expect(contentHex).toBe(expected);
    });

    // We can add more tests for packet parsing if we mock the server response
});
