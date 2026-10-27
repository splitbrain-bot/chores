import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { getSettings } from '../db/settings.ts';
import type { Deps } from '../service/deps.ts';
import { ServiceError } from '../service/errors.ts';
import { bearer } from './auth.ts';
import type { AppEnv } from './env.ts';
import { authRoutes } from './routes/auth.ts';
import { categoryRoutes } from './routes/categories.ts';
import { choreRoutes } from './routes/chores.ts';
import { conditionRoutes } from './routes/conditions.ts';
import { iconRoutes } from './routes/icons.ts';
import { personRoutes } from './routes/persons.ts';
import { settingsRoutes } from './routes/settings.ts';
import { suggestionRoutes } from './routes/suggestions.ts';
import { tokenRoutes } from './routes/tokens.ts';

/** Options of the HTTP app. */
export interface AppOptions {
    version: string;
    /** Directory of the built web app, null to serve no static files. */
    staticDir: string | null;
    /** State of the Home Assistant connection for the health endpoint. */
    health: () => { haConnected: boolean; lastEventAt: number | null };
    /** Adds the MCP route. */
    mcp?: (app: Hono<AppEnv>) => void;
}

/**
 * Creates the Hono app with the API, the MCP route and the web app.
 *
 * @param deps the dependencies
 * @param options the options
 */
export function createApp(deps: Deps, options: AppOptions): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    app.onError((err, c) => {
        if (err instanceof ServiceError) return c.json({ error: err.message }, err.status);
        console.error(err);
        return c.json({ error: 'Internal error' }, 500);
    });

    app.use('*', async (c, next) => {
        await next();
        const { ha_frame_ancestors: origins } = await getSettings(deps.db);
        c.header('Content-Security-Policy', `frame-ancestors ${["'self'", ...origins].join(' ')}`);
    });

    app.get('/api/health', (c) => c.json({ ok: true, ...options.health(), version: options.version }));
    app.route('/api/auth', authRoutes(deps));

    const api = new Hono<AppEnv>();
    api.use('*', bearer(deps));
    for (const routes of [suggestionRoutes, choreRoutes, conditionRoutes, categoryRoutes, personRoutes, settingsRoutes,
        tokenRoutes]) {
        api.route('/', routes(deps));
    }
    app.route('/api', api);
    app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

    app.route('/mdi', iconRoutes());

    options.mcp?.(app);

    const dir = options.staticDir;
    if (dir && existsSync(join(dir, 'index.html'))) {
        const index = readFileSync(join(dir, 'index.html'), 'utf8');
        app.use('*', serveStatic({ root: dir }));
        app.get('*', (c) => c.html(index));
    }
    return app;
}
