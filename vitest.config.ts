import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        exclude: ['test/e2e/**', 'node_modules/**'],
        env: { TZ: 'Europe/Berlin' },
        passWithNoTests: true,
    },
});
