import { defineConfig, devices } from '@playwright/test';

const port = 3100;

export default defineConfig({
    testDir: 'test/e2e',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: `http://localhost:${port}`,
        locale: 'en-US',
        ...devices['Pixel 7'],
    },
    webServer: {
        command: 'npx vite build && node test/e2e/server.ts',
        url: `http://localhost:${port}/api/health`,
        env: { PORT: String(port) },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
