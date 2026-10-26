import { Hono } from 'hono';
import { getSettings, setSettings } from '../../service/admin.ts';
import type { Deps } from '../../service/deps.ts';
import { settingsSchema } from '../../schemas/settings.ts';
import { requires } from '../auth.ts';
import { body, type AppEnv } from '../env.ts';

/**
 * Creates the routes of the settings.
 *
 * @param deps the dependencies
 */
export function settingsRoutes(deps: Deps): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    app.get('/settings', requires('manage'), async (c) => c.json({ settings: await getSettings(deps) }));
    app.put('/settings', requires('manage'), async (c) =>
        c.json({ settings: await setSettings(deps, await body(c, settingsSchema)) }));
    return app;
}
