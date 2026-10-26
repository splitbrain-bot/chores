import { Hono } from 'hono';
import { listTokens, revokeToken } from '../../service/admin.ts';
import { createToken } from '../../service/auth.ts';
import type { Deps } from '../../service/deps.ts';
import { tokenSchema } from '../../schemas/admin.ts';
import { requires } from '../auth.ts';
import { body, idParam, type AppEnv } from '../env.ts';

/**
 * Creates the routes of the tokens.
 *
 * @param deps the dependencies
 */
export function tokenRoutes(deps: Deps): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    app.get('/tokens', requires('manage'), async (c) => c.json({ tokens: await listTokens(deps) }));
    app.post('/tokens', requires('manage'), async (c) => {
        const { kind, label, personId } = await body(c, tokenSchema);
        return c.json(await createToken(deps, kind, label, personId ?? null), 201);
    });
    app.delete('/tokens/:id', requires('manage'), async (c) => {
        await revokeToken(deps, idParam(c));
        return c.json({});
    });
    return app;
}
