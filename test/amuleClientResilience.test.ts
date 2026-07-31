import { describe, it, expect, vi, afterEach } from 'vitest';
import { AmuleECClient } from '../server/utils/amule-ec/AmuleECClient';

/**
 * A daemon that is down must not make every request pay the TCP timeout again:
 * the pages poll, so each retry would queue behind the last one and the whole UI
 * would stall instead of simply reporting the failure.
 */

function offlineClient() {
    const client = new AmuleECClient({ host: '10.0.0.7', port: 4712, password: 'secret' });
    const protocol = (client as any).client;

    vi.spyOn(protocol, 'getIsConnected').mockReturnValue(false);
    const connect = vi.spyOn(protocol, 'connect').mockRejectedValue(new Error('connect ECONNREFUSED'));

    return { client, connect };
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('AmuleECClient when the daemon is unreachable', () => {
    it('names the address it could not reach', async () => {
        const { client } = offlineClient();

        await expect(client.getDownloads()).rejects.toThrow(/10\.0\.0\.7:4712/);
    });

    it('fails fast instead of dialling again during the cooldown', async () => {
        const { client, connect } = offlineClient();

        await expect(client.getDownloads()).rejects.toThrow();
        await expect(client.getDownloads()).rejects.toThrow();
        await expect(client.getSharedFiles()).rejects.toThrow();

        expect(connect).toHaveBeenCalledTimes(1);
    });

    it('dials again once the cooldown has passed', async () => {
        vi.useFakeTimers();
        const { client, connect } = offlineClient();

        await expect(client.getDownloads()).rejects.toThrow();
        vi.advanceTimersByTime(5001);
        await expect(client.getDownloads()).rejects.toThrow();

        expect(connect).toHaveBeenCalledTimes(2);
    });
});
