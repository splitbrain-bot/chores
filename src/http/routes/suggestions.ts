import { Hono } from 'hono';
import type { Deps } from '../../service/deps.ts';
import { getLookahead } from '../../service/lookahead.ts';
import { getOverview } from '../../service/overview.ts';
import { getSuggestions } from '../../service/suggestions.ts';
import { requires } from '../auth.ts';
import type { AppEnv } from '../env.ts';

/**
 * Creates the routes of the suggestions, the look-ahead and the overview.
 *
 * @param deps the dependencies
 */
export function suggestionRoutes(deps: Deps): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    app.get('/suggestions', requires('read'), async (c) => c.json(await getSuggestions(deps, c.var.identity.viewer)));
    app.get('/lookahead', requires('read'), async (c) => c.json(await getLookahead(deps)));
    app.get('/overview', requires('manage'), async (c) => c.json(await getOverview(deps)));
    return app;
}
