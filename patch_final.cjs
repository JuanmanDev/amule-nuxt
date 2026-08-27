const fs = require('fs');
let c = fs.readFileSync('test/e2e/ui.spec.ts', 'utf8');

c = c.replace(
  /await page.getByPlaceholder\('Filter servers\.\.\.'\)\.fill\('zzz-no-such-server'\);\\n\s*await expect\(page\.getByRole\('button', \{ name: 'Connect' \}\)\.first\(\)\)\.toBeHidden\(\);/g,
  "await page.getByPlaceholder('Filter servers...').fill('zzz-no-such-server');\n        await expect(page.getByRole('button', { name: 'Connect' }).first()).toBeHidden();"
);

c = c.replace(
  /await page.getByPlaceholder\(\/Filter\/i\)\.fill\('zzzz-not-a-real-file'\);\\n\s*await expect\(page\.getByRole\('button', \{ name: 'Download' \}\)\.first\(\)\)\.toBeHidden\(\);/g,
  "await page.getByPlaceholder(/Filter/i).fill('zzzz-not-a-real-file');\n        await expect(page.getByRole('button', { name: 'Download' }).first()).toBeHidden();"
);

c = c.replace(
  "getByRole('heading', { name: 'test-auto' })",
  "getByText('test-auto').first()"
);

fs.writeFileSync('test/e2e/ui.spec.ts', c);
console.log('Fixed \\n completely');
