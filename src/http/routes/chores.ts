import { Hono } from 'hono';
import type { Kind } from '../../core/types.ts';
import { getSettings } from '../../service/admin.ts';
import { createChore, deleteChore, getChore, listChores, updateChore } from '../../service/chores.ts';
import type { Deps } from '../../service/deps.ts';
import { markDone, markEarlier, postpone } from '../../service/feedback.ts';
import { choreInputSchema, choreUpdateSchema } from '../../schemas/chore.ts';
import { doneSchema, postponeSchema } from '../../schemas/feedback.ts';
import { requires } from '../auth.ts';
import { body, idParam, type AppEnv } from '../env.ts';

/**
 * Creates the routes of the chores and the feedback.
 *
 * @param deps the dependencies
 */
export function choreRoutes(deps: Deps): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    app.get('/chores', requires('read'), async (c) => {
        const category = c.req.query('category');
        const kind = c.req.query('kind');
        const chores = await listChores(deps, {
            q: c.req.query('q') || undefined,
            categoryId: category ? Number(category) : undefined,
            kind: kind === 'recurring' || kind === 'one_time' ? kind as Kind : undefined,
            includeDeleted: c.req.query('includeDeleted') === 'true',
        });
        return c.json({ chores });
    });

    app.get('/chores/:id', requires('read'), async (c) => c.json(await getChore(deps, idParam(c))));

    app.post('/chores', requires('manage'), async (c) => {
        const chore = await createChore(deps, await body(c, choreInputSchema));
        return c.json({ chore }, 201);
    });

    app.patch('/chores/:id', requires('manage'), async (c) => {
        const id = idParam(c);
        return c.json({ chore: await updateChore(deps, id, await body(c, choreUpdateSchema)) });
    });

    app.delete('/chores/:id', requires('manage'), async (c) => {
        await deleteChore(deps, idParam(c));
        return c.json({});
    });

    app.post('/chores/:id/done', requires('feedback'), async (c) => {
        const id = idParam(c);
        const { also } = await body(c, doneSchema);
        const events = await markDone(deps, c.var.identity.viewer, id, also);
        return c.json({ events, earlierWindowSeconds: (await getSettings(deps)).earlier_window_seconds });
    });

    app.post('/events/:id/earlier', requires('feedback'), async (c) =>
        c.json({ chore: await markEarlier(deps, c.var.identity.viewer, idParam(c)) }));

    app.post('/chores/:id/postpone', requires('feedback'), async (c) => {
        const id = idParam(c);
        const { reason } = await body(c, postponeSchema);
        return c.json({ chore: await postpone(deps, c.var.identity.viewer, id, reason) });
    });

    return app;
}
