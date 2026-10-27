import { Hono } from 'hono';
import { createCondition, deleteCondition, listConditions, updateCondition } from '../../service/conditions.ts';
import type { Deps } from '../../service/deps.ts';
import { conditionSchema, conditionUpdateSchema } from '../../schemas/condition.ts';
import { requires } from '../auth.ts';
import { body, idParam, type AppEnv } from '../env.ts';

/**
 * Creates the routes of the conditions.
 *
 * @param deps the dependencies
 */
export function conditionRoutes(deps: Deps): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    app.get('/conditions', requires('read'), async (c) => c.json({ conditions: await listConditions(deps) }));
    app.post('/conditions', requires('manage'), async (c) => {
        const condition = await createCondition(deps, await body(c, conditionSchema));
        return c.json({ condition }, 201);
    });
    app.patch('/conditions/:id', requires('manage'), async (c) => {
        const id = idParam(c);
        return c.json({ condition: await updateCondition(deps, id, await body(c, conditionUpdateSchema)) });
    });
    app.delete('/conditions/:id', requires('manage'), async (c) => {
        await deleteCondition(deps, idParam(c));
        return c.json({});
    });
    return app;
}
