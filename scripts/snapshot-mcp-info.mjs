/**
 * Refreshes app/utils/demo/mcpInfo.json: what the static demo shows on its
 * MCP page, since it has no server to ask.
 *
 * Starts the built server (`npm run build` first) against a port where no
 * daemon listens - the tool list does not need one - reads /api/mcp-info and
 * stores the parts that do not depend on where the server runs. A test
 * (test/demo.test.ts) fails when the snapshot and server/mcp/tools disagree,
 * which is the cue to run this.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PORT = 3999;
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: { ...process.env, PORT: String(PORT), AMULE_EC_HOST: '127.0.0.1', AMULE_EC_PORT: '4799', AMULE_EC_PASSWORD: 'snapshot', LOG_LEVEL: 'error' },
    stdio: 'ignore'
});

try {
    let response = null;
    for (let attempt = 0; attempt < 60 && !response; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        response = await fetch(`http://127.0.0.1:${PORT}/api/mcp-info`).catch(() => null);
    }
    if (!response) throw new Error('The server did not come up; run `npm run build` first');
    const { success, data, error } = await response.json();
    if (!success) throw new Error(error || 'mcp-info failed');

    const { name, description, instructions, protocolVersion, tools } = data;
    writeFileSync('app/utils/demo/mcpInfo.json', JSON.stringify({ name, description, instructions, protocolVersion, tools }, null, 2) + '\n');
    console.log(`app/utils/demo/mcpInfo.json: ${tools.length} tools, protocol ${protocolVersion}`);
} finally {
    server.kill();
}
