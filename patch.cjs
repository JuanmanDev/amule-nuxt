const fs = require('fs');
let content = fs.readFileSync('test/e2e/ui.spec.ts', 'utf8');

content = content.replace(
  /await expect\(page\.getByRole\('heading', { name: \/\^Results \\\(\\\d\+\\\)\$\/ }\)\)\.toBeVisible\({ timeout: 40_000 }\);/,
  "await expect(page.getByRole('heading', { name: /^ubuntu \\(\\d+\\)$/ })).toBeVisible({ timeout: 40_000 });"
);

content = content.replace(
  "await page.getByPlaceholder('Filter results...').fill('zzzz-not-a-real-file');",
  "await page.getByPlaceholder(/Filter/i).fill('zzzz-not-a-real-file');"
);

fs.writeFileSync('test/e2e/ui.spec.ts', content);
console.log('Patched ui.spec.ts');
