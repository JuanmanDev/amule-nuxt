import { test, expect, type Page } from '@playwright/test';

/**
 * Covers the pages added for uploads, shared files, statistics, connection and
 * preferences, plus the MCP endpoint that exposes the same features to agents.
 */

const NEW_PAGES = ['/uploads', '/shared', '/statistics', '/connection', '/preferences'];

async function gotoReady(page: Page, path: string) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();
}

function failOnConsoleErrors(page: Page, sink: string[]) {
    page.on('console', msg => {
        if (msg.type() === 'error') sink.push(msg.text());
    });
    page.on('pageerror', err => sink.push(`pageerror: ${err.message}`));
}

test.describe('new pages render without client errors', () => {
    for (const path of NEW_PAGES) {
        test(`${path} loads clean`, async ({ page }) => {
            const errors: string[] = [];
            failOnConsoleErrors(page, errors);

            const response = await page.goto(path);
            expect(response?.status()).toBe(200);
            await page.waitForLoadState('networkidle');
            await expect(page.locator('h1')).toBeVisible();

            const overflows = await page.evaluate(
                () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
            );
            expect(overflows, 'page must not scroll horizontally').toBe(false);
            expect(errors, `console errors on ${path}`).toEqual([]);
        });
    }
});

test.describe('uploads page', () => {
    test('shows totals and the clients being uploaded to', async ({ page }) => {
        await gotoReady(page, '/uploads');

        await expect(page.getByText('Clients uploading')).toBeVisible();
        await expect(page.getByText('Total upload speed')).toBeVisible();

        // Uploads come and go on a live daemon, so tolerate an idle moment
        const idle = await page.getByText('No active uploads').isVisible();
        test.skip(idle, 'The daemon has no active uploads right now');

        await expect(page.getByRole('heading', { name: /^Transfers \(\d+\)$/ })).toBeVisible();
        await expect(page.getByText('All time').first()).toBeVisible();

        await page.getByPlaceholder('Filter by file or user...').fill('zzz-no-such-upload');
        await expect(page.getByText('No matches')).toBeVisible();
    });
});

test.describe('shared files page', () => {
    test('lists files and opens details with requests and ratio', async ({ page }) => {
        await gotoReady(page, '/shared');

        await expect(page.getByText('Files shared')).toBeVisible();
        await expect(page.getByRole('heading', { name: /^Files \(\d+\)$/ })).toBeVisible();

        await page.locator('[role="button"][aria-label^="Show details"]').first().click();

        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('Shared file details')).toBeVisible();
        await expect(dialog.getByText('Requests (all time)')).toBeVisible();
        await expect(dialog.getByText('Share ratio')).toBeVisible();
        await expect(dialog.getByText('Clients queued')).toBeVisible();
    });

    test('filters the list', async ({ page }) => {
        await gotoReady(page, '/shared');
        await page.getByPlaceholder('Filter files...').fill('zzz-no-such-file');
        await expect(page.getByText('No matches')).toBeVisible();
    });
});

test.describe('statistics page', () => {
    test('renders the aMule statistics tree and filters it', async ({ page }) => {
        await gotoReady(page, '/statistics');

        await expect(page.getByRole('heading', { name: 'aMule statistics tree' })).toBeVisible();
        // The tree root is "Statistics" and always carries an uptime entry
        await expect(page.getByText(/Uptime/).first()).toBeVisible({ timeout: 20_000 });

        await page.getByPlaceholder('Filter entries...').fill('Uptime');
        await expect(page.getByText(/matching entries/)).toBeVisible();

        await page.getByPlaceholder('Filter entries...').fill('zzz-no-such-stat');
        await expect(page.getByText('No matches')).toBeVisible();
    });
});

test.describe('connection page', () => {
    test('shows both networks and the Kad controls', async ({ page }) => {
        await gotoReady(page, '/connection');

        await expect(page.getByRole('heading', { name: 'eD2k' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Kad' })).toBeVisible();
        await expect(page.getByRole('button', { name: /Bootstrap/ })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Update nodes' })).toBeVisible();

        // Client ID and server name come from the connection state
        await expect(page.getByText('Client ID')).toBeVisible();
    });

    test('rejects a malformed bootstrap address', async ({ page }) => {
        await gotoReady(page, '/connection');

        await page.getByPlaceholder('1.2.3.4').fill('not-an-ip');
        await page.getByRole('button', { name: /^Bootstrap$/ }).click();
        await expect(page.getByText(/Invalid IPv4 address/i).first()).toBeVisible();
    });
});

test.describe('preferences page', () => {
    test('shows the daemon nickname and limits', async ({ page }) => {
        await gotoReady(page, '/preferences');

        const nickname = page.getByRole('textbox').first();
        await expect(nickname).not.toHaveValue('');

        await expect(page.getByText('User hash')).toBeVisible();
        await expect(page.getByText('Upload limit (KB/s)')).toBeVisible();
        await expect(page.getByText('TCP port')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Save limits' })).toBeVisible();
    });
});

test.describe('servers page settings', () => {
    test('shows the server list settings with the configured URL', async ({ page }) => {
        await gotoReady(page, '/servers');

        await expect(page.getByRole('heading', { name: 'Server list settings' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Update list now' })).toBeVisible();

        const urlInput = page.getByPlaceholder('http://upd.emule-security.org/server.met');
        await expect(urlInput).toBeVisible();
        await expect(urlInput).not.toHaveValue('');
    });
});

test.describe('MCP endpoint', () => {
    const rpc = async (page: Page, body: object) => {
        const response = await page.request.post('/mcp', {
            headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
            data: body
        });
        expect(response.ok()).toBeTruthy();
        return response.json();
    };

    test('advertises the aMule tools and answers a tool call', async ({ page }) => {
        const init = await rpc(page, {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } }
        });
        expect(init.result.serverInfo.name).toBe('aMule Nuxt');

        const list = await rpc(page, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
        const names = list.result.tools.map((tool: any) => tool.name);
        expect(names).toContain('amule-status');
        expect(names).toContain('amule-downloads');
        expect(names).toContain('amule-uploads');
        expect(names).toContain('amule-shared-files');
        expect(names).toContain('amule-statistics');
        expect(names).toContain('amule-preferences');

        const status = await rpc(page, {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'amule-status', arguments: {} }
        });
        const payload = JSON.parse(status.result.content[0].text);
        expect(payload).toHaveProperty('ed2kConnected');
        expect(payload).toHaveProperty('kadConnected');
    });

    test('refuses a destructive call without confirmation', async ({ page }) => {
        const result = await rpc(page, {
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: { name: 'amule-server-control', arguments: { action: 'remove', address: '1.2.3.4:1234' } }
        });

        expect(result.result.isError).toBe(true);
        expect(result.result.content[0].text).toContain('confirm: true');
    });

    test('reports a duplicate link with the same wording as the UI', async ({ page }) => {
        const shared: any = await page.request.get('/api/amule/shared').then(response => response.json());
        const withLink = (shared.data?.sharedFiles ?? []).find((file: any) => file.ed2kLink);
        test.skip(!withLink, 'The daemon shares no file with an ed2k link');

        const result = await rpc(page, {
            jsonrpc: '2.0',
            id: 6,
            method: 'tools/call',
            params: { name: 'amule-download-add', arguments: { links: [withLink.ed2kLink] } }
        });

        const payload = JSON.parse(result.result.content[0].text);
        expect(payload.duplicates).toBe(1);
        expect(payload.added).toBe(0);
        expect(payload.results[0].status).toBe('duplicate');
        expect(payload.results[0].message).toContain('Already downloaded and shared as');
    });

    test('reports why an invalid link is rejected', async ({ page }) => {
        const result = await rpc(page, {
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: {
                name: 'amule-download-add',
                arguments: { links: ['ed2k://|file|x|abc|1B73A9aa0DEC788A6DA5A59FB20FCBF054|/'] }
            }
        });

        expect(result.result.isError).toBe(true);
        expect(result.result.content[0].text).toContain('invalid file size');
    });
});
