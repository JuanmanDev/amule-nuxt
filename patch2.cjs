const fs = require('fs');
let content = fs.readFileSync('test/e2e/ui.spec.ts', 'utf8');

if (!content.includes('auto search page')) {
content += `
test.describe('auto search page', () => {
    test('creates an auto search and views its details', async ({ page }) => {
        await gotoReady(page, '/search-auto');

        await page.getByPlaceholder('Enter search keywords...').fill('test-auto');
        const startButton = page.getByRole('button', { name: 'Start auto search', exact: true });
        await expect(startButton).toBeEnabled();
        await startButton.click();

        await expect(page.getByText(/started/i).first()).toBeVisible();

        const searchRow = page.getByRole('link', { name: /test-auto/i }).first();
        await expect(searchRow).toBeVisible();

        await searchRow.click();
        await expect(page).toHaveURL(/\\/search-auto\\/[a-zA-Z0-9_-]+$/, { timeout: 10_000 });

        await expect(page.getByRole('heading', { name: 'test-auto' })).toBeVisible();

        await page.getByRole('button', { name: 'Back' }).click();
        await expect(page).toHaveURL(/\\/search-auto$/);

        const deleteButton = page.getByRole('button', { name: 'Remove this search' }).first();
        await deleteButton.click();

        await expect(page.getByText('test-auto')).toBeHidden();
    });
});
`;
fs.writeFileSync('test/e2e/ui.spec.ts', content);
console.log('Appended auto search page block');
}
