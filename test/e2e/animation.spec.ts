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

        // The row lives inside <AnimatedList>, which animates the space it takes
        expect(await row.evaluate(element =>
            element.parentElement!.classList.contains('animated-list')
        )).toBeTruthy();

        // Polled, not read once: the margin is part of the enter animation, so a
        // single read lands mid-tween on some value between 0 and the real gap.
        // Spacing sits on the row rather than on `* + *`, so a leaving row cannot
        // hand its margin to a neighbour and jump the list by one gap...
        await expect.poll(
            () => row.evaluate(element => getComputedStyle(element).marginBottom),
            { timeout: 5000 }
        ).toBe('16px');

        // ...and the container cancels the trailing one
        const listGap = await row.evaluate(element =>
            getComputedStyle(element.parentElement!).marginBottom
        );
        expect(listGap).toBe('-16px');
    });

    test('an added row transitions its height, not only its opacity', async ({ page }) => {
        await removeTestDownload(page);
        await gotoReady(page, '/downloads');

        const properties = await page.evaluate(() => {
            const probe = document.createElement('div');
            probe.className = 'list-smooth-enter-active';
            document.body.appendChild(probe);
            const style = getComputedStyle(probe);
            const value = { property: style.transitionProperty, overflow: style.overflow };
            probe.remove();
            return value;
        });

        // Without height and margin the row below snaps into place in one frame
        expect(properties.property).toContain('height');
        expect(properties.property).toContain('margin-bottom');
        expect(properties.overflow).toBe('hidden');
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

        // A leaving row collapses in place, so the list closes the gap behind it
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

    test('download rows are translucent and blurred like the upload rows', async ({ page }) => {
        await addTestDownload(page);
        await gotoReady(page, '/downloads');

        const row = page.locator('div[role="button"]', { hasText: TEST_NAME }).first();
        await expect(row).toBeVisible();

        const style = await row.evaluate(element => {
            const computed = getComputedStyle(element);
            return { filter: computed.backdropFilter, background: computed.backgroundColor };
        });

        expect(style.filter).toContain('blur');
        expect(style.background).toMatch(/rgba|color\(|oklch\(.+\/|oklab\(.+\/|\/\s*0\./);

        await removeTestDownload(page);
    });

    test('the dashboard tiles let the background through', async ({ page }) => {
        await gotoReady(page, '/');

        const tile = page.locator('.backdrop-blur-sm').first();
        await expect(tile).toBeAttached();
        const filter = await tile.evaluate(element => getComputedStyle(element).backdropFilter);
        expect(filter).toContain('blur');
    });
});

test.describe('activity background', () => {
    /**
     * Picks a mode in Settings, which is where the cookie behind it is written.
     * Matched on the start of the option: each one also renders its description,
     * and that is part of the accessible name.
     */
    async function chooseBackground(page: Page, option: RegExp) {
        await gotoReady(page, '/settings');
        await page.getByRole('combobox').first().click();
        await page.getByRole('option', { name: option }).click();
    }

    test('the drifting shapes are off until they are asked for', async ({ page }) => {
        await gotoReady(page, '/');

        // The tint costs one composited layer; the shapes animate for as long as
        // the tab is open, so they are not what a first visit pays for
        await expect(page.locator('.activity-bg')).toBeAttached();
        await expect(page.locator('.activity-bg__shapes')).toHaveCount(0);
    });

    test('turning it off removes the layer entirely', async ({ page }) => {
        await chooseBackground(page, /^Off/);
        await gotoReady(page, '/');

        await expect(page.locator('.activity-bg')).toHaveCount(0);
    });

    test('shapes are small, faint, and fade instead of blinking', async ({ page }) => {
        await chooseBackground(page, /^Full animation/);
        await gotoReady(page, '/');

        // Shapes only exist while the daemon reports traffic
        const shape = page.locator('.activity-bg__shape').first();
        test.skip(await shape.count() === 0, 'The daemon is idle, so there are no shapes');

        const facts = await page.evaluate(() => {
            const shapes = [...document.querySelectorAll('.activity-bg__shape')];
            const scope = [...shapes[0]!.attributes]
                .map(attribute => attribute.name)
                .find(name => name.startsWith('data-v-'));

            // The leave fade, read through the scoped attribute the shapes carry
            const probe = document.createElement('div');
            if (scope) probe.setAttribute(scope, '');
            probe.setAttribute('class', 'activity-bg__shape activity-shape-leave-active');
            shapes[0]!.parentElement!.appendChild(probe);
            const leave = getComputedStyle(probe).transitionProperty;
            probe.remove();

            const polygons = shapes.map(node => node.querySelector('.activity-bg__polygon')!);

            return {
                leave,
                sizes: shapes.map(node => Number(getComputedStyle(node).getPropertyValue('--size'))),
                // Both the drift and the per-cycle fade run on the same element
                animations: getComputedStyle(shapes[0]!.querySelector('.activity-bg__drift')!).animationName,
                opacities: polygons.map(node => Number(getComputedStyle(node).opacity)),
                // Only transform and opacity animate, so every frame stays on the
                // compositor instead of going back through layout and paint
                animated: [
                    ...new Set([
                        ...getComputedStyle(shapes[0]!.querySelector('.activity-bg__drift')!)
                            .transitionProperty.split(', '),
                        ...getComputedStyle(polygons[0]!).transitionProperty.split(', ')
                    ])
                ]
            };
        });

        expect(facts.leave).toContain('opacity');
        expect(facts.animations).toContain('activity-cycle');
        // Small enough that a full-size travel margin still clears the viewport
        expect(Math.max(...facts.sizes)).toBeLessThanOrEqual(20);
        expect(Math.max(...facts.opacities)).toBeLessThanOrEqual(0.2);
        for (const property of facts.animated) {
            expect(['opacity', 'transform', 'all', 'none']).toContain(property);
        }
    });

    test('the tint is composited rather than blurred over the whole viewport', async ({ page }) => {
        await gotoReady(page, '/');

        const wash = page.locator('.activity-bg__wash').first();
        await expect(wash).toBeAttached();

        const style = await wash.evaluate(element => {
            const computed = getComputedStyle(element);
            return { filter: computed.filter, transition: computed.transitionProperty };
        });

        // A full screen blur filter had to be re-rendered on every frame of the
        // transition that followed each status poll
        expect(style.filter).toBe('none');
        expect(style.transition).toBe('opacity');
    });
});

test.describe('frosted panels', () => {
    test('can be turned off, and then nothing blurs its backdrop', async ({ page }) => {
        await gotoReady(page, '/settings');
        await page.getByRole('switch').first().click();

        await gotoReady(page, '/');
        const card = page.locator('div.backdrop-blur-md').first();
        await expect(card).toBeAttached();

        const filter = await card.evaluate(element => getComputedStyle(element).backdropFilter);
        expect(filter).toBe('none');
    });
});

test.describe('reduced motion', () => {
    test('animations are neutralised when the user asks for less motion', async ({ page }) => {
        await gotoReady(page, '/downloads');
        await page.emulateMedia({ reducedMotion: 'reduce' });

        const durations = await page.evaluate(() =>
            ['list-enter-active', 'list-smooth-enter-active', 'list-smooth-move'].map(className => {
                const probe = document.createElement('div');
                probe.className = className;
                document.body.appendChild(probe);
                const value = getComputedStyle(probe).transitionDuration;
                probe.remove();
                return value;
            })
        );

        // 0s: the CSS drops every transition under prefers-reduced-motion
        for (const duration of durations) {
            expect(duration.replace(/\s/g, '')).toMatch(/^0s(,0s)*$/);
        }
    });
});
