const path = require('path');
const amulePath = path.resolve(process.cwd(), 'server/utils/amule-ec/lib/amule.cjs');
const amule = require(amulePath);

console.log('AMuleCli methods:');
const methods = Object.getOwnPropertyNames(amule.AMuleCli.prototype);
methods.forEach(m => {
    console.log(m);
});
