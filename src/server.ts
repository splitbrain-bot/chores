import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { listConditions } from './db/conditions.ts';
import { HomeAssistant } from './ha/connection.ts';
import { TemplateManager } from './ha/templates.ts';
import { Watcher } from './ha/watcher.ts';
import { Scheduler } from './jobs/scheduler.ts';
import { createApp } from './http/app.ts';
import { addMcpRoute } from './http/mcp.ts';
import type { Deps } from './service/deps.ts';
import { watchList } from './service/presence.ts';

const config = loadConfig();
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const db = await createDatabase(config.DATABASE_PATH);
const ha = config.HA_URL && config.HA_TOKEN ? new HomeAssistant(config.HA_URL, config.HA_TOKEN) : null;
const deps: Deps = { db, ha, now: Date.now };

let watcher: Watcher | null = null;

/**
 * Connects to Home Assistant, records the missed states, opens the subscriptions and starts the scheduler.
 *
 * @param conn the Home Assistant connection
 */
async function startHomeAssistant(conn: HomeAssistant): Promise<void> {
    const w = new Watcher(db, conn);
    const templates = new TemplateManager(db, conn);
    const scheduler = new Scheduler({ ...deps, ha: conn });
    const syncTemplates = () => listConditions(db).then((conditions) => templates.sync(conditions));
    const syncEntities = () => watchList(db).then((list) => w.setEntities(list));
    const log = (what: string) => (err: unknown) => console.error(`${what} failed`, err);

    deps.onConditionsChanged = () => {
        syncTemplates().catch(log('Template sync'));
    };
    deps.onPersonsChanged = () => {
        syncEntities().catch(log('Entity sync'));
        scheduler.refreshCalendars().catch(log('Calendar refresh'));
    };
    deps.onSettingsChanged = () => {
        scheduler.refreshForecast().catch(log('Forecast refresh'));
        scheduler.refreshHolidays().catch(log('Holiday refresh'));
        scheduler.refreshCalendars().catch(log('Calendar refresh'));
    };

    await conn.start();
    console.log('Connected to Home Assistant');
    watcher = w;
    await syncEntities();
    await w.gapFill();
    await syncTemplates();
    conn.onReady(() => w.gapFill().catch(log('Gap fill')));
    scheduler.start();
}

const app = createApp(deps, {
    version,
    staticDir: config.STATIC_DIR,
    health: () => ({ haConnected: ha?.connected ?? false, lastEventAt: watcher?.lastEventAt ?? null }),
    mcp: (a) => addMcpRoute(a, deps, version),
});

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    console.log(`Listening on port ${info.port}`);
});

if (ha) {
    startHomeAssistant(ha).catch((err) => console.error('Home Assistant start failed', err));
} else {
    console.warn('HA_URL or HA_TOKEN is missing, running without Home Assistant');
}
