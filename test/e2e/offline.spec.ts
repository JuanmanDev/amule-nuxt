import { test, expect, type Page } from '@playwright/test';

/**
 * Runs against a server whose daemon is unreachable, which is how CI exercises the
 * app without an aMule instance.
 *
 * The contract: every page still renders, the failure is reported to the user, and
 * nothing crashes the server or the client.
 */

const PAGES = [
    '/',
    '/downloads',
    '/uploads',
    '/shared',
    '/servers',
    '/search',
    '/connection',
    '/statistics',
    '/stats',
    '/preferences',
    '/logs',
    '/settings',
    '/mcp-server'
];

/** Only real failures matter here; a failed API call is expected. */
function collectHardErrors(page: Page, sink: string[]) {
    page.on('pageerror', error => sink.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const text = message.text();
        // Network failures are the point of this suite
        if (/Failed to load resource|net::ERR|fetch failed|500 \(/i.test(text)) return;
        sink.push(text);
    });
}

test.describe('with no daemon reachable', () => {
    for (const path of PAGES) {
        test(`${path} still renders`, async ({ page }) => {
            const errors: string[] = [];
            collectHardErrors(page, errors);

            const response = await page.goto(path);
            expect(response?.status(), `${path} must not 5xx`).toBeLessThan(500);
            await page.waitForLoadState('domcontentloaded');

            // Vue rendered something, not a blank page
            await expect(page.locator('h1')).toBeVisible();

            const overflows = await page.evaluate(
                () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
            );
            expect(overflows, 'no horizontal overflow').toBe(false);

            expect(errors, `unexpected client errors on ${path}`).toEqual([]);
        });
    }

    test('the API reports the failure instead of throwing', async ({ request }) => {
        for (const endpoint of ['/api/amule/status', '/api/amule/downloads', '/api/amule/uploads']) {
            const response = await request.get(endpoint);
            expect(response.status(), `${endpoint} must answer`).toBe(200);

            const body = await response.json();
            // status() degrades to a "not connected" payload, the lists report an error
            if (endpoint === '/api/amule/status') {
                expect(body.data.connected).toBe(false);
            } else {
                expect(body.success === false || Array.isArray(body.data)).toBeTruthy();
            }
        }
    });

    test('adding a link fails with a message rather than a crash', async ({ request }) => {
        const response = await request.post('/api/amule/downloads/add', {
            data: { link: 'ed2k://|file|offline.bin|1024|AAAA0000FFFF1111AAAA0000FFFF5555|/' }
        });

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(String(body.error ?? '')).not.toHaveLength(0);
    });

    test('an invalid link is rejected before the daemon is even needed', async ({ request }) => {
        const response = await request.post('/api/amule/downloads/add', {
            data: { link: 'ed2k://|file|bad.bin|not-a-number|1B73A9aa0DEC788A6DA5A59FB20FCBF054|/' }
        });

        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.data.results[0].status).toBe('rejected');
        expect(body.data.results[0].message).toContain('invalid file size');
    });

    test('the MCP endpoint still advertises its tools', async ({ request }) => {
        const response = await request.post('/mcp', {
            headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
            data: { jsonrpc: '2.0', id: 1, method: 'tools/list' }
        });

        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.result.tools.length).toBeGreaterThan(10);
    });

    test('an MCP tool reports the daemon failure as a tool error', async ({ request }) => {
        const response = await request.post('/mcp', {
            headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
            data: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: { name: 'amule-downloads', arguments: {} }
            }
        });

        const body = await response.json();
        expect(body.result.isError).toBe(true);
        expect(body.result.content[0].text).toMatch(/Error getting aMule downloads/);
    });

    test('diagnostics answer even when the daemon does not', async ({ request }) => {
        const body = await request.get('/api/diagnostics').then(response => response.json());

        expect(body.success).toBe(true);
        expect(['development', 'production']).toContain(body.data.environment);
        expect(typeof body.data.logLevel).toBe('number');
    });
});

/**
 * The look and the animation rules are pure CSS, so CI can check them without a
 * daemon: a broken theme override or a dropped keyframe would show up here.
 */
test.describe('presentation without a daemon', () => {
    test('cards are translucent and blurred', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('h1')).toBeVisible();

        const card = page.locator('div.backdrop-blur-md').first();
        await expect(card).toBeAttached();

        const style = await card.evaluate(element => {
            const computed = getComputedStyle(element);
            return { filter: computed.backdropFilter, background: computed.backgroundColor };
        });

        expect(style.filter).toContain('blur');
        expect(style.background).toMatch(/rgba|color\(|oklch\(.+\/|\/\s*0\./);
    });

    test('list and value transitions are defined', async ({ page }) => {
        await page.goto('/downloads');
        await expect(page.locator('h1')).toBeVisible();

        const durations = await page.evaluate(() => {
            const read = (className: string) => {
                const probe = document.createElement('div');
                probe.className = className;
                document.body.appendChild(probe);
                const value = getComputedStyle(probe).transitionDuration;
                probe.remove();
                return value;
            };
            return { list: read('list-enter-active'), value: read('value-enter-active') };
        });

        expect(durations.list).not.toMatch(/^0s/);
        expect(durations.value).not.toMatch(/^0s/);
    });

    test('reduced motion switches the animations off', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto('/downloads');
        await expect(page.locator('h1')).toBeVisible();

        const duration = await page.evaluate(() => {
            const probe = document.createElement('div');
            probe.className = 'list-enter-active';
            document.body.appendChild(probe);
            const value = getComputedStyle(probe).transitionDuration;
            probe.remove();
            return value;
        });

        expect(duration.replace(/\s/g, '')).toMatch(/^0s(,0s)*$/);
    });
});
