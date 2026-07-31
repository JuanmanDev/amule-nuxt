import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite runs against a already running dev/preview server (default :3003),
 * because the tests drive a real aMule daemon through the API.
 */
export default defineConfig({
    testDir: './test/e2e',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 60_000,
    expect: { timeout: 15_000 },
    reporter: [['list']],
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:3003',
        trace: 'retain-on-failure',
        viewport: { width: 1280, height: 900 }
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    ]
});
