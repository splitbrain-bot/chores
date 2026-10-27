import { Hono } from 'hono';
import { createCategory, deleteCategory, listCategories, updateCategory } from '../../service/admin.ts';
import type { Deps } from '../../service/deps.ts';
import { categorySchema, categoryUpdateSchema } from '../../schemas/admin.ts';
import { requires } from '../auth.ts';
import { body, idParam, type AppEnv } from '../env.ts';

/**
 * Creates the routes of the categories.
 *
 * @param deps the dependencies
 */
export function categoryRoutes(deps: Deps): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    app.get('/categories', requires('read'), async (c) => c.json({ categories: await listCategories(deps) }));
    app.post('/categories', requires('manage'), async (c) => {
        const { name, sort, icon } = await body(c, categorySchema);
        return c.json({ category: await createCategory(deps, name, sort, icon) }, 201);
    });
    app.patch('/categories/:id', requires('manage'), async (c) => {
        const id = idParam(c);
        return c.json({ category: await updateCategory(deps, id, await body(c, categoryUpdateSchema)) });
    });
    app.delete('/categories/:id', requires('manage'), async (c) => {
        await deleteCategory(deps, idParam(c));
        return c.json({});
    });
    return app;
}
