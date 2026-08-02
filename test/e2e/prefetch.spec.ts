import { test, expect, type Page } from '@playwright/test';

/**
 * Covers the two reasons the lists used to appear and disappear:
 *
 *  * every page owned its own data, so opening one started from a skeleton, and
 *  * a failed refresh replaced the list with an error box.
 *
 * The feeds in `useAmuleFeeds` are shared and prefetched, so the first visit is
 * the only one that may show a skeleton, and the queue keeps refreshing while
 * the user is on another page.
 */

async function gotoReady(page: Page, path: string) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();
}

function collectConsoleErrors(page: Page, sink: string[]) {
    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') sink.push(msg.text());
    });
    page.on('pageerror', err => sink.push(`pageerror: ${err.message}`));
}

test.describe('prefetched feeds', () => {
    test('a revisited page renders its list without a loading skeleton', async ({ page }) => {
        const problems: string[] = [];
        collectConsoleErrors(page, problems);

        // First visit may load; from then on the feed is cached app-wide.
        await gotoReady(page, '/uploads');
        await gotoReady(page, '/shared');

        // Back to uploads: no skeleton, no "Loading uploads..." caption.
        await page.goto('/uploads');
        await expect(page.locator('h1')).toContainText('Uploads');
        await expect(page.getByText('Loading uploads...')).toHaveCount(0);

        await page.goto('/shared');
        await expect(page.getByText('Loading shared files...')).toHaveCount(0);

        await page.goto('/downloads');
        await expect(page.getByText('Loading downloads...')).toHaveCount(0);

        // Vue warns loudly when a <Transition> gets more than one child, which is
        // the mistake to catch while wrapping states in <SmoothSwap>.
        expect(problems.filter(text => /Transition/i.test(text))).toEqual([]);
    });

    test('the queue and the uploads keep refreshing from another page', async ({ page }) => {
        const calls: string[] = [];
        await page.route('**/api/amule/**', async route => {
            calls.push(new URL(route.request().url()).pathname);
            await route.continue();
        });

        // The dashboard shows neither the uploads nor the shared files, so any
        // call for them comes from the background prefetch.
        await gotoReady(page, '/');
        calls.length = 0;
        await page.waitForTimeout(24_000);

        const downloads = calls.filter(path => path === '/api/amule/downloads').length;
        const uploads = calls.filter(path => path === '/api/amule/uploads').length;
        const shared = calls.filter(path => path === '/api/amule/shared').length;
        console.log(`in 24 s: downloads=${downloads} uploads=${uploads} shared=${shared}`);

        // 10 s cadence in the background, so at least two rounds in 24 s.
        expect(downloads).toBeGreaterThanOrEqual(2);
        expect(uploads).toBeGreaterThanOrEqual(2);
        // The shared list is on a 60 s cycle: it must not poll at the fast rate.
        expect(calls.filter(path => path === '/api/amule/shared').length).toBeLessThanOrEqual(1);
    });

    test('polling stops while the tab is hidden', async ({ page }) => {
        await gotoReady(page, '/');

        const calls: string[] = [];
        await page.route('**/api/amule/uploads', async route => {
            calls.push(route.request().url());
            await route.continue();
        });

        // Fake a background tab: the scheduler checks document.visibilityState.
        await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });

        calls.length = 0;
        await page.waitForTimeout(12_000);
        expect(calls.length).toBe(0);

        // Coming back must not wait out the rest of the interval.
        await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await expect.poll(() => calls.length, { timeout: 5000 }).toBeGreaterThan(0);
    });
});

test.describe('smooth state changes', () => {
    test('a state swap animates its height instead of snapping', async ({ page }) => {
        await gotoReady(page, '/shared');

        const filter = page.getByPlaceholder('Filter files...');
        if (await filter.count() === 0) test.skip(true, 'this daemon shares no files');

        // The list is replaced by "No matches". SmoothSwap pins the leaving block's
        // height and animates it to zero, so sampling that block frame by frame
        // must show it shrinking through several values rather than vanishing.
        const observed = await page.evaluate(async () => {
            const heights: number[] = [];
            let sawTransitionClass = false;
            const input = document.querySelector('input[placeholder="Filter files..."]') as HTMLInputElement;

            const collect = () => {
                const leaving = document.querySelector('.smooth-swap-leave-active') as HTMLElement | null;
                if (leaving) {
                    sawTransitionClass = true;
                    heights.push(Math.round(leaving.getBoundingClientRect().height));
                }
            };

            input.value = 'zzz-nothing-matches-this-zzz';
            input.dispatchEvent(new Event('input', { bubbles: true }));

            await new Promise<void>(resolve => {
                const started = performance.now();
                const tick = () => {
                    collect();
                    if (performance.now() - started > 600) resolve();
                    else requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            });
            return { heights, sawTransitionClass };
        });

        expect(observed.sawTransitionClass, 'transition classes were applied').toBe(true);
        const distinct = new Set(observed.heights);
        expect(distinct.size, `heights seen: ${[...distinct].join(', ')}`).toBeGreaterThan(2);
        // ... and it must end up collapsed rather than jumping straight to zero.
        expect(Math.min(...observed.heights)).toBeLessThan(Math.max(...observed.heights));

        await expect(page.getByText('No matches')).toBeVisible();
    });

    test('the transition classes are actually in the stylesheet', async ({ page }) => {
        await gotoReady(page, '/');

        const rules = await page.evaluate(() => {
            const wanted = ['.smooth-swap-enter-active', '.smooth-swap-leave-active', '.page-enter-active', '.list-move'];
            const found: string[] = [];
            for (const sheet of Array.from(document.styleSheets)) {
                let cssRules: CSSRuleList;
                try { cssRules = sheet.cssRules; } catch { continue; }
                for (const rule of Array.from(cssRules)) {
                    const text = (rule as CSSStyleRule).selectorText;
                    if (text && wanted.some(selector => text.includes(selector))) found.push(text);
                }
            }
            return found;
        });

        // Without these the markup would transition nothing at all.
        expect(rules.join(' ')).toContain('.smooth-swap-enter-active');
        expect(rules.join(' ')).toContain('.page-enter-active');
    });
});
