import { test, expect, type Page } from '@playwright/test';

/**
 * The pages slide in the direction of the navigation: down the menu the old page
 * leaves to the left and the new one arrives from the right, back up the menu
 * both go the other way.
 *
 * Three things can break that without breaking anything else, which is why they
 * are covered here rather than left to the eye:
 *
 *  * the direction stamp on <html> (plugins/nav-direction.client.ts) - without it
 *    every navigation animates forward and Back feels wrong,
 *  * the sign of the travel in the stylesheet - easy to mirror by accident,
 *  * the horizontal overflow the travel can cause: the pages move further than
 *    the container's padding on a narrow screen, so `overflow-x-clip` on the page
 *    container in app.vue is what keeps a scrollbar from flashing on every
 *    navigation.
 */

/** The x translation of the page mid-flight, sampled frame by frame. */
async function sample(page: Page, href: string) {
    await page.evaluate(() => {
        (window as any).__frames = [];
        const read = () => {
            const el = document.querySelector('.page-leave-active, .page-enter-active') as HTMLElement | null;
            if (el) {
                const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
                (window as any).__frames.push({
                    phase: el.classList.contains('page-leave-active') ? 'leave' : 'enter',
                    x: matrix.m41,
                    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
                });
            }
            requestAnimationFrame(read);
        };
        requestAnimationFrame(read);
    });

    // Whichever navigation is on screen at this width: the top bar on a desktop,
    // the bottom bar on a phone. The other one is in the DOM but hidden.
    await page.locator(`a[href="${href}"]`).locator('visible=true').first().click();
    // Longer than the 0.22s transition, so the last frames are the settled ones.
    await page.waitForTimeout(600);

    return page.evaluate(() => (window as any).__frames as { phase: string; x: number; overflow: number }[]);
}

test.describe('page transitions', () => {
    test('the pages travel with the navigation and back against it', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1')).toBeVisible();

        // Dashboard -> Downloads is forward: out to the left, in from the right.
        const forward = await sample(page, '/downloads');
        expect(await page.evaluate(() => document.documentElement.dataset.navDir)).toBe('forward');
        expect(forward.length, 'transition classes were applied').toBeGreaterThan(2);
        expect(Math.min(...forward.filter(f => f.phase === 'leave').map(f => f.x))).toBeLessThan(-8);
        expect(Math.max(...forward.filter(f => f.phase === 'enter').map(f => f.x))).toBeGreaterThan(8);

        // ...and back up the menu is the mirror of it.
        const back = await sample(page, '/');
        expect(await page.evaluate(() => document.documentElement.dataset.navDir)).toBe('back');
        expect(Math.max(...back.filter(f => f.phase === 'leave').map(f => f.x))).toBeGreaterThan(8);
        expect(Math.min(...back.filter(f => f.phase === 'enter').map(f => f.x))).toBeLessThan(-8);
    });

    test('the sideways travel never adds a horizontal scrollbar', async ({ page }) => {
        // Narrow enough that the travel is wider than the container's padding,
        // which is the case that needs the clipping.
        await page.setViewportSize({ width: 390, height: 780 });
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const frames = await sample(page, '/downloads');
        expect(frames.length).toBeGreaterThan(2);
        expect(Math.max(...frames.map(f => f.overflow))).toBeLessThanOrEqual(0);
    });

    test('nothing moves for a visitor who asked for less motion', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // The classes still apply - `transition: none` and no travel are what make
        // them do nothing, including on the single frame before Vue removes them.
        const frames = await sample(page, '/downloads');
        for (const frame of frames) expect(frame.x).toBe(0);
    });
});
