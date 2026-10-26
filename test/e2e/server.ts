import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { openDatabase } from '../../src/db/database.ts';
import { createApp } from '../../src/http/app.ts';
import { addMcpRoute } from '../../src/http/mcp.ts';
import type { Deps } from '../../src/service/deps.ts';
import { seed } from './seed.ts';

const dir = mkdtempSync(join(tmpdir(), 'chores-e2e-'));
const path = join(dir, 'e2e.sqlite');
await seed(path);
const deps: Deps = { db: openDatabase(path), ha: null, now: Date.now };

const app = createApp(deps, {
    version: 'e2e',
    staticDir: 'web/dist',
    health: () => ({ haConnected: false, lastEventAt: null }),
    mcp: (a) => addMcpRoute(a, deps, 'e2e'),
});

// the reset route exists only in the test server
app.post('/__test/reset', async (c) => {
    await deps.db.destroy();
    rmSync(dir, { recursive: true, force: true });
    await seed(path);
    deps.db = openDatabase(path);
    return c.json({ ok: true });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3100) }, (info) => console.log(`E2E server on ${info.port}`));
