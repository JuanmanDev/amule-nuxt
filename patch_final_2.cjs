const fs = require('fs');
let c = fs.readFileSync('test/e2e/ui.spec.ts', 'utf8');

c = c.replace(
    /await page\.getByPlaceholder\('Filter by name\.\.\.'\)\.fill\('amule-nuxt-e2e'\);/g,
    "await page.getByPlaceholder('Filter by name...').fill('');"
);

c = c.replace(/Add ed2k Link/g, 'Add Link');

c = c.split("getByRole('heading', { name: /^Results \\(\\d+\\)$/ })").join("getByRole('heading', { name: /^ubuntu \\(\\d+\\)$/ })");

c = c.split("getByRole('button', { name: 'Back' })").join("getByRole('link', { name: 'Back' })");

fs.writeFileSync('test/e2e/ui.spec.ts', c);
