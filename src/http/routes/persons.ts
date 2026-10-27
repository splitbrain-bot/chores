import { Hono } from 'hono';
import { createPerson, listPersons, updatePerson } from '../../service/admin.ts';
import { can } from '../../service/auth.ts';
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
    // a token without the right to manage gets only the values that the chore cards show
    app.get('/persons', requires('read'), async (c) => {
        const persons = await listPersons(deps);
        if (can(c.var.identity.kind, 'manage')) return c.json({ persons });
        return c.json({ persons: persons.map(({ id, name, sort, color }) => ({ id, name, sort, color })) });
    });
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
