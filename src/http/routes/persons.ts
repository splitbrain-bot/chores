import { Hono } from 'hono';
import { createPerson, listPersons, updatePerson } from '../../service/admin.ts';
import type { Deps } from '../../service/deps.ts';
import { personSchema, personUpdateSchema } from '../../schemas/admin.ts';
import { requires } from '../auth.ts';
import { body, idParam, type AppEnv } from '../env.ts';

/**
 * Creates the routes of the persons.
 *
 * @param deps the dependencies
 */
export function personRoutes(deps: Deps): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    app.get('/persons', requires('manage'), async (c) => c.json({ persons: await listPersons(deps) }));
    app.post('/persons', requires('manage'), async (c) => {
        const person = await createPerson(deps, await body(c, personSchema));
        return c.json({ person }, 201);
    });
    app.patch('/persons/:id', requires('manage'), async (c) => {
        const id = idParam(c);
        return c.json({ person: await updatePerson(deps, id, await body(c, personUpdateSchema)) });
    });
    return app;
}
