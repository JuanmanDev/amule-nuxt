import { test, expect, type Page } from '@playwright/test';

/**
 * These tests drive the real UI against a running aMule daemon.
 *
 * Test downloads use a syntactically valid ed2k link with a hash that exists
 * nowhere, so the daemon creates a partfile that never finds a source: no
 * network traffic, and it is removed again at the end of each test.
 */
const TEST_HASH = 'abcdef0123456789abcdef0123456789';
// Long on purpose: the list must truncate it and the details modal must not.
const TEST_NAME = `amule-nuxt-e2e-${'a-really-long-file-name-segment-'.repeat(8)}end.bin`;
const TEST_LINK = `ed2k://|file|${TEST_NAME}|1024|${TEST_HASH.toUpperCase()}|/`;

// Separate fixture for the UTF-8 test: its name must not match the other tests
const UTF8_HASH = 'aaaa0000ffff1111aaaa0000ffff3333';

const PAGES = ['/', '/downloads', '/shared', '/servers', '/stats', '/logs', '/settings', '/search'];

async function removeTestDownload(page: Page) {
    await page.request.post(`/api/amule/downloads/${TEST_HASH}/cancel`).catch(() => undefined);
}

async function addTestDownload(page: Page) {
    const res = await page.request.post('/api/amule/downloads/add', { data: { link: TEST_LINK } });
    expect(res.ok()).toBeTruthy();
}

/**
 * Navigates and waits until the page is hydrated and its first fetch resolved.
 * Typing before hydration is lost: Vue re-renders the input from its own state.
 */
async function gotoReady(page: Page, path: string) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Loading downloads...')).toBeHidden();
    await expect(page.locator('h1')).toBeVisible();
}

/** Fails the test on any console error or uncaught exception. */
function failOnConsoleErrors(page: Page, sink: string[]) {
    page.on('console', msg => {
        if (msg.type() === 'error') sink.push(msg.text());
    });
    page.on('pageerror', err => sink.push(`pageerror: ${err.message}`));
}

test.describe('pages render without client errors', () => {
    for (const path of PAGES) {
        test(`${path} loads clean`, async ({ page }) => {
            const errors: string[] = [];
            failOnConsoleErrors(page, errors);

            const response = await page.goto(path);
            expect(response?.status()).toBe(200);
            await page.waitForLoadState('networkidle');

            // Vue must have hydrated and rendered a heading
            await expect(page.locator('h1')).toBeVisible();

            // No horizontal page overflow at desktop width
            const overflows = await page.evaluate(
                () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
            );
            expect(overflows, 'page must not scroll horizontally').toBe(false);

            expect(errors, `console errors on ${path}`).toEqual([]);
        });
    }
});

test.describe('downloads page', () => {
    test.afterEach(async ({ page }) => {
        await removeTestDownload(page);
        await page.request.post(`/api/amule/downloads/${UTF8_HASH}/cancel`).catch(() => undefined);
    });

    test('rejects an invalid link and explains why', async ({ page }) => {
        await gotoReady(page, '/downloads');

        const addButton = page.getByRole('button', { name: 'Add', exact: true });
        await page.getByPlaceholder(/ed2k:\/\/\|file\|/).fill('ed2k://|file|bad.bin|1132ss587375|1B73A9aa0DEC788A6DA5A59FB20FCBF054|/');
        await expect(addButton).toBeEnabled();
        await addButton.click();

        // Toast carries the daemon-side reason; the queue stays empty
        await expect(page.getByText(/invalid file size/i).first()).toBeVisible();
        // The rejected file must not appear in the queue (which may hold other downloads)
        await expect(page.locator('[role="button"]', { hasText: 'bad.bin' })).toHaveCount(0);
    });

    test('adds links whose file name contains non-ASCII characters', async ({ page }) => {
        // EC transports strings as UTF-8; mis-encoding them made aMule reject the link
        const accentLink = `ed2k://|file|amule-nuxt-utf8-Ricks.días,.Rick-fu-sión.bin|1024|${UTF8_HASH.toUpperCase()}|/`;

        await gotoReady(page, '/downloads');
        const addButton = page.getByRole('button', { name: 'Add', exact: true });
        await page.getByPlaceholder(/ed2k:\/\/\|file\|/).fill(accentLink);
        await expect(addButton).toBeEnabled();
        await addButton.click();

        await expect(page.getByText('Download added').first()).toBeVisible();
        // The accented name must survive the round trip through the daemon
        await expect(page.getByText(/Ricks\.días,\.Rick-fu-sión/).first()).toBeVisible({ timeout: 20_000 });

        await page.request.post(`/api/amule/downloads/${UTF8_HASH}/cancel`);
    });

    test('reports a link that is already in the queue instead of adding it twice', async ({ page }) => {
        await addTestDownload(page);
        await gotoReady(page, '/downloads');

        const addButton = page.getByRole('button', { name: 'Add', exact: true });
        await page.getByPlaceholder(/ed2k:\/\/\|file\|/).fill(TEST_LINK);
        await expect(addButton).toBeEnabled();
        await addButton.click();

        await expect(page.getByText('Already in aMule').first()).toBeVisible();
        await expect(page.getByText(/Already in the download queue as/).first()).toBeVisible();

        // Still exactly one entry in the queue
        await expect(page.locator('[role="button"]', { hasText: 'amule-nuxt-e2e' })).toHaveCount(1);
    });

    test('reports an already shared file as a duplicate', async ({ page }) => {
        const shared: any = await page.request.get('/api/amule/shared').then(response => response.json());
        const withLink = (shared.data?.sharedFiles ?? []).find((file: any) => file.ed2kLink);
        test.skip(!withLink, 'The daemon shares no file with an ed2k link');

        await gotoReady(page, '/downloads');
        const addButton = page.getByRole('button', { name: 'Add', exact: true });
        await page.getByPlaceholder(/ed2k:\/\/\|file\|/).fill(withLink.ed2kLink);
        await expect(addButton).toBeEnabled();
        await addButton.click();

        await expect(page.getByText('Already in aMule').first()).toBeVisible();
        await expect(page.getByText(/Already downloaded and shared as/).first()).toBeVisible();
    });

    test('shows a sourceless link as "Searching", with what to check and a remove shortcut', async ({ page }) => {
        await addTestDownload(page);
        await gotoReady(page, '/downloads');

        const row = page.locator('[role="button"]', { hasText: 'amule-nuxt-e2e' }).first();
        await expect(row).toBeVisible();
        // Leads with the search, since that is the normal state after adding a link
        await expect(row.getByText('Searching', { exact: true })).toBeVisible();
        await expect(row.getByText(/Searching for sources/)).toBeVisible();
        // and still says what to check when it stays that way
        await expect(row.getByText(/32 character hash/)).toBeVisible();

        const remove = row.getByRole('button', { name: 'Remove' });
        await expect(remove).toBeVisible();

        // Badge and remove action both sit at the right edge of the row
        const edges = await row.evaluate(element => {
            const right = (node: Element | null) =>
                node ? Math.round(node.getBoundingClientRect().right) : null;
            const badge = [...element.querySelectorAll('span')]
                .find(node => node.textContent?.trim() === 'Searching');
            return {
                row: Math.round(element.getBoundingClientRect().right),
                badge: right(badge?.parentElement ?? badge ?? null),
                actions: right(element.querySelector('[aria-label="Actions"]')),
                remove: right([...element.querySelectorAll('button')]
                    .find(node => node.textContent?.trim() === 'Remove') ?? null)
            };
        });

        // Within the padding of the row's right edge, not adrift after the text
        expect(edges.row - edges.actions!).toBeLessThan(40);
        expect(edges.actions! - edges.badge!).toBeLessThan(120);
        expect(edges.row - edges.remove!).toBeLessThan(40);
    });

    test('truncates long names in the list but shows them in full in the details modal', async ({ page }) => {
        await addTestDownload(page);
        await gotoReady(page, '/downloads');

        const name = page.locator('p.truncate', { hasText: TEST_NAME }).first();
        await expect(name).toBeVisible();

        // Truncated in the list: the text does not fit its box
        const truncated = await name.evaluate(el => el.scrollWidth > el.clientWidth);
        expect(truncated, 'long name should be truncated in the list').toBe(true);

        // Clicking the row opens the details modal with the full, wrapped name
        await name.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText('Download details')).toBeVisible();

        const fullName = dialog.locator('p.break-all').first();
        await expect(fullName).toHaveText(TEST_NAME);
        const wrapped = await fullName.evaluate(el => el.scrollWidth <= el.clientWidth + 2);
        expect(wrapped, 'name must be fully visible in the modal').toBe(true);

        // Details include the identifiers needed to verify a pasted link
        await expect(dialog.getByText(TEST_HASH, { exact: true })).toBeVisible();
        await expect(dialog.getByText('Available parts')).toBeVisible();
    });

    test('asks for confirmation before removing and then removes', async ({ page }) => {
        await addTestDownload(page);
        await gotoReady(page, '/downloads');

        const row = page.locator('[role="button"]', { hasText: 'amule-nuxt-e2e' }).first();
        await row.getByRole('button', { name: 'Remove' }).click();

        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText(/aMule deletes the data downloaded so far/)).toBeVisible();

        // Keeping it leaves the download in place
        await dialog.getByRole('button', { name: 'Keep it' }).click();
        await expect(row).toBeVisible();

        await row.getByRole('button', { name: 'Remove' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();

        // Only the test download disappears; unrelated queue entries stay
        await expect(page.locator('[role="button"]', { hasText: 'amule-nuxt-e2e' })).toHaveCount(0, { timeout: 20_000 });
    });

    test('filters the queue by name', async ({ page }) => {
        await addTestDownload(page);
        await gotoReady(page, '/downloads');

        await expect(page.locator('[role="button"]', { hasText: 'amule-nuxt-e2e' }).first()).toBeVisible();

        await page.getByPlaceholder('Filter by name...').fill('definitely-not-there');
        await expect(page.getByText('No matches')).toBeVisible();

        await page.getByPlaceholder('Filter by name...').fill('amule-nuxt-e2e');
        await expect(page.locator('[role="button"]', { hasText: 'amule-nuxt-e2e' }).first()).toBeVisible();
    });
});

test.describe('dashboard', () => {
    test.afterEach(async ({ page }) => {
        await removeTestDownload(page);
    });

    test('offers an add form and summarises the queue', async ({ page }) => {
        await addTestDownload(page);
        await gotoReady(page, '/');

        await expect(page.getByRole('heading', { name: 'Add download' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Current downloads' })).toBeVisible();

        const summary = page.locator('a[href="/downloads"]').filter({ hasText: 'amule-nuxt-e2e' }).first();
        await expect(summary).toBeVisible();
        await expect(page.getByText(/in queue/).first()).toBeVisible();
    });

    test('adds a link from the dashboard', async ({ page }) => {
        await removeTestDownload(page);
        await gotoReady(page, '/');

        const addButton = page.getByRole('button', { name: 'Add', exact: true });
        await page.locator('textarea').first().fill(TEST_LINK);
        await expect(addButton).toBeEnabled();
        await addButton.click();

        // AddLinkForm takes you to the queue you just added to, so the row is
        // asserted there rather than in the dashboard summary: that summary only
        // holds the new download for the tick between the refresh and the
        // navigation, which is a race, not a behaviour.
        await expect(page).toHaveURL(/\/downloads$/, { timeout: 20_000 });
        await expect(
            page.locator('div[role="button"]').filter({ hasText: 'amule-nuxt-e2e' }).first()
        ).toBeVisible({ timeout: 20_000 });
    });
});

test.describe('mobile layout', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('downloads page fits a phone screen', async ({ page }) => {
        await addTestDownload(page);
        await gotoReady(page, '/downloads');
        await expect(page.locator('[role="button"]', { hasText: 'amule-nuxt-e2e' }).first()).toBeVisible();

        const overflows = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
        );
        expect(overflows, 'no horizontal scrolling on mobile').toBe(false);

        await removeTestDownload(page);
    });

    test('the menu sits at the bottom, with adding a link under the links', async ({ page }) => {
        await gotoReady(page, '/downloads');
        await page.getByRole('button', { name: 'Menu' }).click();

        const addLink = page.getByRole('button', { name: 'Add ed2k Link' });
        await expect(addLink).toBeVisible();

        const layout = await page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"]')!;
            const top = (node: Element | null | undefined) =>
                node ? Math.round(node.getBoundingClientRect().top) : null;

            const settings = [...dialog.querySelectorAll('a')]
                .find(link => link.textContent?.trim() === 'Settings');
            const add = [...dialog.querySelectorAll('button')]
                .find(button => button.textContent?.trim() === 'Add ed2k Link');

            return {
                links: top(settings),
                add: top(add),
                icons: top(dialog.querySelector('[aria-label="GitHub"]')),
                // The wrapper has to be a full-height column for `mt-auto` to
                // push the content down; a class on <template> would be dropped
                wrapper: dialog.querySelector('.min-h-full')?.className ?? null
            };
        });

        // Order down the menu: links, then the add action, then the icon row
        expect(layout.links).toBeLessThan(layout.add!);
        expect(layout.add).toBeLessThan(layout.icons!);
        expect(layout.wrapper).toContain('flex-col');
    });
});

test.describe('search page', () => {
    test.afterEach(async ({ page }) => {
        await page.request.post('/api/amule/search/stop').catch(() => undefined);
    });

    test('runs a search and shows results with download buttons', async ({ page }) => {
        await gotoReady(page, '/search');

        await page.getByPlaceholder('Enter search keywords...').fill('ubuntu');
        const searchButton = page.getByRole('button', { name: 'Search', exact: true });
        await expect(searchButton).toBeEnabled();
        await searchButton.click();

        // Progress card appears while results are still arriving
        await expect(page.getByText(/results so far/)).toBeVisible();

        // Results arrive within a few polls
        await expect(page.getByRole('heading', { name: /^Results \(\d+\)$/ })).toBeVisible({ timeout: 40_000 });
        await expect(page.getByRole('button', { name: 'Download' }).first()).toBeVisible();

        // Filtering narrows the list without another network round trip
        await page.getByPlaceholder('Filter results...').fill('zzzz-not-a-real-file');
        await expect(page.getByText('No matches')).toBeVisible();
    });
});

test.describe('servers page', () => {
    test('lists servers, filters them and validates the add form', async ({ page }) => {
        await gotoReady(page, '/servers');

        await expect(page.getByRole('heading', { name: /^Server list \(\d+\)$/ })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Connect' }).first()).toBeVisible();

        // Filtering by a nonsense term shows the empty state
        await page.getByPlaceholder('Filter servers...').fill('zzz-no-such-server');
        await expect(page.getByText('No matches')).toBeVisible();
        await page.getByPlaceholder('Filter servers...').fill('');

        // The daemon rejects a malformed address with a readable reason
        await page.getByPlaceholder('176.123.5.89:4725').fill('not-an-ip');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(page.getByText(/Invalid server address/i).first()).toBeVisible();
    });

    test('asks before removing a server', async ({ page }) => {
        await gotoReady(page, '/servers');

        await page.getByRole('button', { name: 'Remove' }).first().click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText(/from the server list\?/)).toBeVisible();

        // Cancel: nothing is removed
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
    });
});
