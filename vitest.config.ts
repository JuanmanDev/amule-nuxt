import { defineConfig } from 'vitest/config';

/**
 * Unit tests only. The Playwright suite under test/e2e drives a real browser
 * and is run with `npm run test:e2e`.
 */
export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        exclude: ['test/e2e/**', 'node_modules/**', '.nuxt/**', '.output/**']
    }
});
