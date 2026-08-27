const fs = require('fs');
let c = fs.readFileSync('test/e2e/ui.spec.ts', 'utf8');
c = c.replace('text=Add ed2k Link', 'text=Add Link');
fs.writeFileSync('test/e2e/ui.spec.ts', c);
console.log('Fixed Add Link');
