import { test, expect, type Page } from '@playwright/test';

/**
 * Covers the list and value animations, the glass surfaces, and the columns
 * that must not appear on a phone.
 *
 * The test download uses a hash that exists nowhere, so the daemon creates a
 * partfile that never finds a source and is removed again at the end.
 */
const TEST_HASH = 'bbbb1111cccc2222bbbb1111cccc2222';
const TEST_NAME = 'amule-nuxt-e2e-animation.bin';
const TEST_LINK = `ed2k://|file|${TEST_NAME}|2048|${TEST_HASH.toUpperCase()}|/`;

async function gotoReady(page: Page, path: string) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();
}

async function removeTestDownload(page: Page) {
    await page.request.post(`/api/amule/downloads/${TEST_HASH}/cancel`).catch(() => undefined);
}

async function addTestDownload(page: Page) {
    const response = await page.request.post('/api/amule/downloads/add', { data: { link: TEST_LINK } });
    expect(response.ok()).toBeTruthy();
}

test.describe('list animations', () => {
    test.afterEach(async ({ page }) => {
        await removeTestDownload(page);
    });

    test('a download added from the form animates into the queue', async ({ page }) => {
        await removeTestDownload(page);
        await gotoReady(page, '/downloads');

        const input = page.getByPlaceholder(/^ed2k:\/\/\|file\|name\|size\|hash\|\/ or magnet/);
        await expect(input).toBeVisible();
        await input.fill(TEST_LINK);
        await page.getByRole('button', { name: 'Add', exact: true }).click();

        const row = page.locator('div[role="button"]', { hasText: TEST_NAME }).first();
        await expect(row).toBeVisible();

        // The row lives inside the animated group, so removals get a transition
        const animated = await row.evaluate(element =>
            Boolean(element.parentElement?.className.includes('space-y-4'))
        );
        expect(animated).toBeTruthy();
    });

    test('removing a download leaves the list without an abrupt jump', async ({ page }) => {
        await removeTestDownload(page);
        const added = await page.request.post('/api/amule/downloads/add', { data: { link: TEST_LINK } });
        expect(added.ok()).toBeTruthy();

        await gotoReady(page, '/downloads');
        const row = page.locator('div[role="button"]', { hasText: TEST_NAME }).first();
        await expect(row).toBeVisible();

        await row.getByRole('button', { name: 'Actions' }).click();
        await page.getByRole('menuitem', { name: 'Remove' }).click();
        // Scoped to the dialog: the row menu also offers a Remove entry
        await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();

        // Leaving rows are taken out of the flow, so the row disappears cleanly
        await expect(row).toBeHidden({ timeout: 15000 });
    });
});

test.describe('animated values', () => {
    test('live figures are wrapped so a change crossfades', async ({ page }) => {
        await gotoReady(page, '/');

        // The dashboard speeds update on every poll
        const tile = page.getByRole('link', { name: /Download speed/i }).first();
        test.skip(await tile.count() === 0, 'The dashboard tiles are not rendered');

        // AnimatedValue renders an inline-flex wrapper with overflow hidden
        const wrapped = await tile.evaluate(element =>
            Boolean(element.querySelector('span.inline-flex.relative.overflow-hidden'))
        );
        expect(wrapped).toBeTruthy();
    });

    test('the queue speed animates instead of snapping', async ({ page }) => {
        // The summary only renders with something in the queue
        await addTestDownload(page);
        await gotoReady(page, '/downloads');
        const speed = page.getByTestId('queue-speed');
        await expect(speed).toBeVisible();

        const wrapped = await speed.evaluate(element =>
            Boolean(element.querySelector('span.inline-flex.relative.overflow-hidden'))
        );
        expect(wrapped).toBeTruthy();
        await removeTestDownload(page);
    });
});

test.describe('mobile layout', () => {
    // The columns can only be checked against a real row
    test.beforeEach(async ({ page }) => {
        await addTestDownload(page);
    });

    test.afterEach(async ({ page }) => {
        await removeTestDownload(page);
    });

    test('ETA is hidden on a phone so the stats stay on one row', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await gotoReady(page, '/downloads');

        const row = page.locator('div[role="button"]', { hasText: TEST_NAME }).first();
        await expect(row).toBeVisible();

        // Exact: the stalled-source note also mentions the words
        await expect(row.getByText('ETA', { exact: true })).toBeHidden();
        await expect(row.getByText('Speed', { exact: true })).toBeVisible();
        await expect(row.getByText('Size', { exact: true })).toBeVisible();

        // One row of stats: size and speed share it, nothing wraps below
        const boxes = await row.locator('span', { hasText: /^(Size|Speed)$/ }).evaluateAll(
            elements => elements.map(element => element.getBoundingClientRect().top)
        );
        expect(new Set(boxes).size, 'size and speed labels share a row').toBe(1);
    });

    test('ETA is back on a wider screen', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await gotoReady(page, '/downloads');

        const row = page.locator('div[role="button"]', { hasText: TEST_NAME }).first();
        await expect(row).toBeVisible();
        await expect(row.getByText('ETA', { exact: true })).toBeVisible();
    });
});

test.describe('glass surfaces', () => {
    test('cards are translucent and blurred over the animated background', async ({ page }) => {
        await gotoReady(page, '/');

        const card = page.locator('div.backdrop-blur-md').first();
        await expect(card).toBeAttached();

        const style = await card.evaluate(element => {
            const computed = getComputedStyle(element);
            return { filter: computed.backdropFilter, background: computed.backgroundColor };
        });

        expect(style.filter).toContain('blur');
        // A translucent surface: the background colour carries an alpha channel
        expect(style.background).toMatch(/rgba|color\(|oklch\(.+\/|\/\s*0\./);
    });

    test('the dashboard tiles let the background through', async ({ page }) => {
        await gotoReady(page, '/');

        const tile = page.locator('.backdrop-blur-sm').first();
        await expect(tile).toBeAttached();
        const filter = await tile.evaluate(element => getComputedStyle(element).backdropFilter);
        expect(filter).toContain('blur');
    });
});

test.describe('reduced motion', () => {
    test('animations are neutralised when the user asks for less motion', async ({ page }) => {
        await gotoReady(page, '/downloads');
        await page.emulateMedia({ reducedMotion: 'reduce' });

        const durations = await page.evaluate(() => {
            const probe = document.createElement('div');
            probe.className = 'list-enter-active';
            document.body.appendChild(probe);
            const value = getComputedStyle(probe).transitionDuration;
            probe.remove();
            return value;
        });

        // 0s: the CSS drops every transition under prefers-reduced-motion
        expect(durations.replace(/\s/g, '')).toMatch(/^0s(,0s)*$/);
    });
});
