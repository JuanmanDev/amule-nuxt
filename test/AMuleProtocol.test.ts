import { describe, it, expect, vi } from 'vitest';
import { AMuleProtocol, ECOpCodes, ECCodes } from '../server/utils/amule-ec/lib/AMuleProtocol';
import md5 from 'blueimp-md5';

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

    // We can add more tests for packet parsing if we mock the server response
});
