const path = require('path');
const md5 = require('blueimp-md5');
const amulePath = path.resolve(process.cwd(), 'server/utils/amule-ec/lib/amule.cjs');
const amule = require(amulePath);

const config = {
    host: 'localhost',
    port: 4712,
    password: 'mule'
};

const client = new amule.AMuleCli(
    config.host,
    Number(config.port),
    config.password,
    md5
);

client.connect()
    .then(() => client.getDownloads())
    .then(downloads => {
        const files = Array.isArray(downloads) ? downloads : (downloads.children || []);
        console.log('Downloads found:', files.length);
        files.forEach(f => {
            console.log('File:', f.partfile_name);
            console.log('  Hash:', f.partfile_hash);
            console.log('  Status Code:', f.partfile_status);
            console.log('  Speed:', f.partfile_speed);
            console.log('  Size:', f.partfile_size_full);
            console.log('  Done:', f.partfile_size_done);
        });
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
