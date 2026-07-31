import { describe, it, expect, vi } from 'vitest';
import { addLinksWithStatus } from '../server/utils/amule-ec/addLinks';
import type { AmuleECClient } from '../server/utils/amule-ec/AmuleECClient';

/**
 * The shared add path used by both the HTTP endpoint and the MCP tool.
 * Duplicate detection is the interesting part: aMule accepts a known hash and
 * merely merges sources, and refuses one it already shares.
 */

const QUEUED_HASH = 'aaaa0000ffff1111aaaa0000ffff1111';
const SHARED_HASH = 'bbbb0000ffff1111bbbb0000ffff1111';
const NEW_HASH = 'cccc0000ffff1111cccc0000ffff1111';

const link = (hash: string, name = 'file.bin') =>
    `ed2k://|file|${name}|1024|${hash.toUpperCase()}|/`;

function fakeClient(overrides: Partial<Record<'addLink', any>> = {}) {
    const addLink = overrides.addLink ?? vi.fn().mockResolvedValue({ success: true, message: 'Link added successfully' });

    return {
        addLink,
        getDownloads: vi.fn().mockResolvedValue([{ hash: QUEUED_HASH, name: 'already-downloading.bin' }]),
        getSharedFiles: vi.fn().mockResolvedValue([{ hash: SHARED_HASH, fileName: 'already-shared.bin' }])
    } as unknown as AmuleECClient & { addLink: any };
}

describe('addLinksWithStatus', () => {
    it('reports a genuinely new link as added', async () => {
        const result = await addLinksWithStatus(fakeClient(), [link(NEW_HASH)]);

        expect(result).toMatchObject({ added: 1, duplicates: 0, rejected: 0 });
        expect(result.results[0]).toMatchObject({ status: 'added', success: true });
    });

    it('reports a queued hash as a duplicate and names it', async () => {
        const result = await addLinksWithStatus(fakeClient(), [link(QUEUED_HASH)]);

        expect(result).toMatchObject({ added: 0, duplicates: 1, rejected: 0 });
        expect(result.results[0]).toMatchObject({
            status: 'duplicate',
            existingName: 'already-downloading.bin'
        });
        expect(result.results[0]!.message).toContain('download queue');
        expect(result.results[0]!.message).toContain('merged the sources');
    });

    it('treats an already shared file as a duplicate even though aMule refuses it', async () => {
        const client = fakeClient({
            addLink: vi.fn().mockResolvedValue({ success: false, message: 'Invalid link or already on list.' })
        });

        const result = await addLinksWithStatus(client, [link(SHARED_HASH)]);

        expect(result).toMatchObject({ added: 0, duplicates: 1, rejected: 0 });
        expect(result.results[0]!.message).toContain('Already downloaded and shared as');
    });

    it('passes a refusal through when the hash is unknown', async () => {
        const client = fakeClient({
            addLink: vi.fn().mockResolvedValue({ success: false, message: 'ed2k link has an invalid file size' })
        });

        const result = await addLinksWithStatus(client, [link(NEW_HASH)]);

        expect(result).toMatchObject({ added: 0, duplicates: 0, rejected: 1 });
        expect(result.results[0]).toMatchObject({ status: 'rejected', success: false });
    });

    it('classifies a mixed batch and keeps the input order', async () => {
        const client = fakeClient({
            addLink: vi.fn()
                .mockResolvedValueOnce({ success: true, message: 'Link added successfully' })
                .mockResolvedValueOnce({ success: true, message: 'Link added successfully' })
                .mockResolvedValueOnce({ success: false, message: 'Invalid link or already on list.' })
        });

        const result = await addLinksWithStatus(client, [
            link(NEW_HASH, 'new.bin'),
            link(QUEUED_HASH, 'queued.bin'),
            link('dddd0000ffff1111dddd0000ffff1111', 'rejected.bin')
        ]);

        expect(result.results.map(entry => entry.status)).toEqual(['added', 'duplicate', 'rejected']);
        expect(result).toMatchObject({ added: 1, duplicates: 1, rejected: 1 });
    });

    it('skips blank entries and trims the rest', async () => {
        const client = fakeClient();
        const result = await addLinksWithStatus(client, ['   ', `  ${link(NEW_HASH)}  `, '']);

        expect(result.results).toHaveLength(1);
        expect(client.addLink).toHaveBeenCalledWith(link(NEW_HASH));
    });

    it('still adds when the queue lookup fails', async () => {
        const client = fakeClient();
        (client.getDownloads as any).mockRejectedValue(new Error('EC down'));
        (client.getSharedFiles as any).mockRejectedValue(new Error('EC down'));

        const result = await addLinksWithStatus(client, [link(NEW_HASH)]);

        expect(result).toMatchObject({ added: 1, duplicates: 0, rejected: 0 });
    });
});
