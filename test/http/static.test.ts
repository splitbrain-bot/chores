import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/http/app.ts';
import { Clock, makeDeps } from '../service/helpers.ts';

describe('static files', () => {
    it('serves the files and the index for the app routes', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'chores-web-'));
        mkdirSync(join(dir, 'assets'));
        writeFileSync(join(dir, 'index.html'), '<div id="root"></div>');
        writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
        const deps = await makeDeps(new Clock('2026-10-31T09:00:00+01:00'));
        const app = createApp(deps, { version: 'x', staticDir: dir, health: () => ({ haConnected: false, lastEventAt: null }) });

        expect(await (await app.request('/assets/app.js')).text()).toBe('console.log(1)');
        const page = await app.request('/chores/12');
        expect(await page.text()).toBe('<div id="root"></div>');
        expect(page.headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
        expect((await app.request('/api/nothing')).status).toBe(401);
    });

    it('serves the Material Design icons and their list', async () => {
        const deps = await makeDeps(new Clock('2026-10-31T09:00:00+01:00'));
        const app = createApp(deps, { version: 'x', staticDir: null, health: () => ({ haConnected: false, lastEventAt: null }) });

        const icon = await app.request('/mdi/stove.svg');
        expect(icon.headers.get('content-type')).toBe('image/svg+xml');
        expect(await icon.text()).toContain('<svg');
        expect((await app.request('/mdi/no-such-icon.svg')).status).toBe(404);
        expect((await app.request('/mdi/..%2Fpackage.json')).status).toBe(404);
        const index = await (await app.request('/mdi/index.json')).json() as [string, string][];
        expect(index.find(([name]) => name === 'stove')).toEqual(['stove', expect.stringContaining('food')]);
    });
});
