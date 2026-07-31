import { test, expect, type Page } from '@playwright/test';

/**
 * Covers the shared list controls, the MCP information page, the statistics
 * figures taken from aMule itself, and the layout stability when an overlay opens.
 */

async function gotoReady(page: Page, path: string) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();
}

const LIST_PAGES = ['/downloads', '/shared', '/uploads', '/servers', '/logs'];

test.describe('shared list controls', () => {
    for (const path of LIST_PAGES) {
        test(`${path} offers filter, sort and both directions in one row`, async ({ page }) => {
            await gotoReady(page, path);

            const filter = page.getByPlaceholder(/Filter/).first();
            // The controls only appear once the list has something to sort
            test.skip(await filter.count() === 0, `${path} has no entries to sort`);
            const sortButton = page.getByRole('button', { name: /^Sort by / });
            const directionButton = page.getByRole('button', { name: /(Ascending|Descending)/ });

            await expect(filter).toBeVisible();
            await expect(sortButton).toBeVisible();
            await expect(directionButton).toBeVisible();

            // All three sit on the same visual row
            const boxes = await Promise.all([
                filter.boundingBox(),
                sortButton.boundingBox(),
                directionButton.boundingBox()
            ]);
            const centres = boxes.map(box => (box!.y + box!.height / 2));
            expect(Math.max(...centres) - Math.min(...centres)).toBeLessThan(12);

            // Direction toggles both ways
            const before = await directionButton.getAttribute('aria-label');
            await directionButton.click();
            await expect(directionButton).not.toHaveAttribute('aria-label', before!);
            await directionButton.click();
            await expect(directionButton).toHaveAttribute('aria-label', before!);
        });
    }

    test('sorting the download queue applies and reverses', async ({ page }) => {
        await gotoReady(page, '/downloads');
        test.skip(await page.getByText('No downloads found').isVisible(), 'The queue is empty');

        await page.getByRole('button', { name: /^Sort by / }).click();
        await page.getByRole('menuitem', { name: 'Name' }).click();

        const names = () => page.locator('p.truncate').allInnerTexts();
        const ascending = await names();

        await page.getByRole('button', { name: /(Ascending|Descending)/ }).click();
        const descending = await names();

        expect(descending).toEqual([...ascending].reverse());
    });
});

test.describe('mobile layout of the controls', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('search, sort and direction fit one row without horizontal scrolling', async ({ page }) => {
        await gotoReady(page, '/shared');

        const overflows = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
        );
        expect(overflows, 'no horizontal scrolling on mobile').toBe(false);

        // The sort button collapses to its icon below sm, so it renders no visible text
        const sortButton = page.getByRole('button', { name: /^Sort by / });
        await expect(sortButton).toBeVisible();
        expect((await sortButton.innerText()).trim(), 'sort label is hidden on mobile').toBe('');
    });
});

test.describe('layout stability', () => {
    test('opening a select does not shift the page sideways', async ({ page }) => {
        await gotoReady(page, '/statistics');

        const before = await page.evaluate(() => document.body.getBoundingClientRect().left);

        // The window select is a Nuxt UI select, which locks the body scroll while open
        await page.locator('button[role="combobox"]').first().click();
        await expect(page.locator('[role="listbox"]').first()).toBeVisible();

        const during = await page.evaluate(() => document.body.getBoundingClientRect().left);
        expect(Math.abs(during - before), 'body must not move when the overlay opens').toBeLessThan(1);
    });
});

test.describe('statistics page', () => {
    test('shows session and all-time figures from aMule', async ({ page }) => {
        await gotoReady(page, '/statistics');

        await expect(page.getByRole('heading', { name: 'Transferred data' })).toBeVisible();
        await expect(page.getByText('all time').first()).toBeVisible();
        await expect(page.getByText('this session').first()).toBeVisible();

        // The rates come from the daemon, so they are not zero on a seeding box
        await expect(page.getByText('Max upload (session)')).toBeVisible();
        const maxUpload = await page.getByText('Max upload (session)').locator('xpath=following-sibling::div[1]').innerText();
        expect(maxUpload).not.toBe('0 KB/s');

        await expect(page.getByText(/daemon uptime/)).toBeVisible();
    });
});

test.describe('MCP information page', () => {
    test('lists the endpoint, the tools and a client snippet', async ({ page }) => {
        await gotoReady(page, '/mcp-server');

        await expect(page.getByRole('heading', { name: 'MCP server' })).toBeVisible();
        await expect(page.getByText('/mcp').first()).toBeVisible();
        await expect(page.getByRole('heading', { name: /^Tools \(\d+\)$/ })).toBeVisible();
        await expect(page.getByText('amule-status').first()).toBeVisible();

        // Destructive tools are flagged
        await expect(page.getByText('destructive').first()).toBeVisible();

        // Filtering the tool list works
        await page.getByPlaceholder('Filter tools...').fill('zzz-no-such-tool');
        await expect(page.getByText('No matches')).toBeVisible();
    });

    test('browsers opening the endpoint land on the page', async ({ page }) => {
        await page.goto('/mcp');
        await expect(page).toHaveURL(/\/mcp-server$/);
    });
});

test.describe('speed shortcuts', () => {
    test('dashboard speed tiles link to their pages', async ({ page }) => {
        await gotoReady(page, '/');

        await page.locator('a[href="/uploads"]').filter({ hasText: 'Upload speed' }).click();
        await expect(page).toHaveURL(/\/uploads$/);

        await gotoReady(page, '/');
        await page.locator('a[href="/downloads"]').filter({ hasText: 'Download speed' }).click();
        await expect(page).toHaveURL(/\/downloads$/);
    });

    test('dashboard shows the activity tiles, the add form and the queue summary', async ({ page }) => {
        await gotoReady(page, '/');

        await expect(page.getByRole('heading', { name: 'Add download' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Current downloads' })).toBeVisible();
        await expect(page.locator('a[href="/uploads"]').first()).toBeVisible();
        await expect(page.locator('a[href="/downloads"]').first()).toBeVisible();
    });

    test('the summary always offers a way to see every download', async ({ page }) => {
        await gotoReady(page, '/');
        await expect(page.getByRole('link', { name: /(See all \d+ downloads|Manage downloads|Open the download queue)/ }).first()).toBeVisible();
    });
});

test.describe('paste button on link inputs', () => {
    // Granting clipboard-read lets the button work headlessly
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    const LINK = 'ed2k://|file|paste-test.bin|1024|AAAA0000FFFF1111AAAA0000FFFF4444|/';

    for (const path of ['/downloads', '/', '/add']) {
        test(`${path} offers a paste button while the field is empty`, async ({ page }) => {
            await gotoReady(page, path);

            const paste = page.getByRole('button', { name: 'Paste' }).first();
            await expect(paste).toBeVisible();

            await page.evaluate(text => navigator.clipboard.writeText(text), LINK);
            await paste.click();

            // The link lands in the field, and the button steps aside once filled
            const field = page.locator('textarea, input[placeholder*="ed2k"]').first();
            await expect(field).toHaveValue(new RegExp('paste-test\.bin'));
            await expect(paste).toBeHidden();
        });
    }

    test('the batch modal offers it too', async ({ page }) => {
        await gotoReady(page, '/');

        await page.getByRole('button', { name: 'Add Link' }).first().click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();

        const paste = dialog.getByRole('button', { name: 'Paste' });
        await expect(paste).toBeVisible();

        await page.evaluate(text => navigator.clipboard.writeText(text), LINK);
        await paste.click();

        await expect(dialog.locator('textarea')).toHaveValue(new RegExp('paste-test\.bin'));
        await expect(paste).toBeHidden();
    });
});

test.describe('download details modal on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    const HASH = 'aaaa0000ffff1111aaaa0000ffff7777';
    const LINK = `ed2k://|file|amule-nuxt-modal-mobile.bin|1024|${HASH.toUpperCase()}|/`;

    test.afterEach(async ({ page }) => {
        await page.request.post(`/api/amule/downloads/${HASH}/cancel`).catch(() => undefined);
    });

    test('footer actions are full width and reachable', async ({ page }) => {
        await page.request.post('/api/amule/downloads/add', { data: { link: LINK } });
        await gotoReady(page, '/downloads');

        await page.locator('p.truncate', { hasText: 'amule-nuxt-modal-mobile' }).first().click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();

        const pause = dialog.getByRole('button', { name: /^(Pause|Resume)$/ });
        const remove = dialog.getByRole('button', { name: 'Remove' });
        // The dialog's own X is also called "Close"; the footer one comes last
        const close = dialog.getByRole('button', { name: 'Close' }).last();

        for (const button of [pause, remove, close]) {
            await expect(button).toBeVisible();
            const box = (await button.boundingBox())!;
            // Comfortable tap target
            expect(box.height, 'tap target height').toBeGreaterThanOrEqual(28);
        }

        // Pause spans the dialog width, Remove and Close share a row
        const dialogBox = (await dialog.boundingBox())!;
        const pauseBox = (await pause.boundingBox())!;
        expect(pauseBox.width).toBeGreaterThan(dialogBox.width * 0.7);

        const removeBox = (await remove.boundingBox())!;
        const closeBox = (await close.boundingBox())!;
        expect(Math.abs(removeBox.y - closeBox.y), 'remove and close share a row').toBeLessThan(6);
        expect(removeBox.y).toBeGreaterThan(pauseBox.y);

        // Nothing overflows sideways
        const overflows = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
        );
        expect(overflows).toBe(false);
    });
});

test.describe('after adding a link', () => {
    const HASH = 'aaaa0000ffff1111aaaa0000ffff8888';
    const LINK = `ed2k://|file|amule-nuxt-goto-queue.bin|1024|${HASH.toUpperCase()}|/`;

    test.afterEach(async ({ page }) => {
        await page.request.post(`/api/amule/downloads/${HASH}/cancel`).catch(() => undefined);
    });

    test('the dashboard sends you to the queue once every link landed', async ({ page }) => {
        await page.request.post(`/api/amule/downloads/${HASH}/cancel`).catch(() => undefined);
        await gotoReady(page, '/');

        await page.locator('textarea').first().fill(LINK);
        const add = page.getByRole('button', { name: 'Add', exact: true });
        await expect(add).toBeEnabled();
        await add.click();

        await expect(page).toHaveURL(/\/downloads$/, { timeout: 20_000 });
        await expect(page.locator('[role="button"]', { hasText: 'amule-nuxt-goto-queue' }).first()).toBeVisible();
    });

    test('a rejected link keeps you where you are', async ({ page }) => {
        await gotoReady(page, '/');

        await page.locator('textarea').first().fill('ed2k://|file|bad.bin|not-a-number|1B73A9aa0DEC788A6DA5A59FB20FCBF054|/');
        await page.getByRole('button', { name: 'Add', exact: true }).click();

        await expect(page.getByText(/invalid file size/i).first()).toBeVisible();
        await expect(page).toHaveURL(/\/$/);
    });
});

test.describe('activity background', () => {
    test('renders behind the app and reacts to traffic', async ({ page }) => {
        await gotoReady(page, '/');

        const background = page.locator('.activity-bg');
        await expect(background).toBeAttached();

        // Sits behind the content and never intercepts clicks
        const styles = await background.evaluate(element => {
            const computed = getComputedStyle(element);
            return { zIndex: computed.zIndex, pointerEvents: computed.pointerEvents, position: computed.position };
        });
        expect(styles.pointerEvents).toBe('none');
        expect(styles.position).toBe('fixed');
        expect(Number(styles.zIndex)).toBeLessThan(0);

        // The daemon under test is seeding, so polygons are present
        const shapes = await page.locator('.activity-bg polygon').count();
        expect(shapes).toBeGreaterThan(0);
    });

    test('drops the motion when reduced motion is requested', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await gotoReady(page, '/');

        await expect(page.locator('.activity-bg__shapes')).toBeHidden();
        // The ambient tint stays
        await expect(page.locator('.activity-bg__wash')).toBeAttached();
    });
});

test.describe('queue summary alignment', () => {
    test('badges sit on the right, speed next to the filter', async ({ page }) => {
        await gotoReady(page, '/downloads');
        const badge = page.locator('span', { hasText: /^\d+ in queue$/ }).first();
        test.skip(await badge.count() === 0, 'The queue is empty');

        const filter = page.getByPlaceholder('Filter by name...');
        const filterBox = (await filter.boundingBox())!;
        const badgeBox = (await badge.boundingBox())!;

        // Right aligned: the badge ends further right than the filter does
        expect(badgeBox.x + badgeBox.width).toBeGreaterThan(filterBox.x + filterBox.width);
    });

    test('on a phone the speed sits under the filter, aligned right', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await gotoReady(page, '/downloads');

        // Scoped by test id: the navigation also links to /statistics
        const speed = page.getByTestId('queue-speed');
        test.skip(await speed.count() === 0, 'The queue is empty');

        const filterBox = (await page.getByPlaceholder('Filter by name...').boundingBox())!;
        const speedBox = (await speed.boundingBox())!;
        const rowRight = await page.evaluate(() => {
            const element = document.querySelector('[data-testid="queue-speed"]')?.parentElement;
            const box = element!.getBoundingClientRect();
            return box.right;
        });

        // Below the filter, and flush with the right edge of its row
        expect(speedBox.y).toBeGreaterThan(filterBox.y);
        expect(rowRight - (speedBox.x + speedBox.width), 'speed hugs the right edge').toBeLessThan(20);
    });
});
