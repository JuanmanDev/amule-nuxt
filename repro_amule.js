
const { exec } = require('child_process');

console.log('PATH:', process.env.PATH);

exec('amulecmd --version', (error, stdout, stderr) => {
    if (error) {
        console.error('Error executing amulecmd:', error);
    } else {
        console.log('amulecmd stdout:', stdout);
    }
    if (stderr) {
        console.log('amulecmd stderr:', stderr);
    }
});

exec('/usr/bin/amulecmd --version', (error, stdout, stderr) => {
    if (error) {
        console.error('Error executing /usr/bin/amulecmd:', error);
    } else {
        console.log('/usr/bin/amulecmd stdout:', stdout);
    }
});
