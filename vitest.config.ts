import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests only. The Playwright suite under test/e2e drives a real browser
 * and is run with `npm run test:e2e`.
 */
export default defineConfig({
    resolve: {
        alias: {
            // The same alias Nuxt provides, so shared/ code is importable from tests
            '#shared': fileURLToPath(new URL('./shared', import.meta.url))
        }
    },
    test: {
        include: ['test/**/*.test.ts'],
        exclude: ['test/e2e/**', 'node_modules/**', '.nuxt/**', '.output/**']
    }
});
