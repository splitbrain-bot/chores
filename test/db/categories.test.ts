import { describe, expect, it } from 'vitest';
import { createCategory, deleteCategory, getCategory, listCategories, updateCategory } from '../../src/db/categories.ts';
import { createChore, getChore } from '../../src/db/chores.ts';
import { memoryDb } from './helpers.ts';
import { newChore } from './fixtures.ts';

describe('categories', () => {
    it('creates, lists, updates and deletes categories', async () => {
        const db = await memoryDb();
        const kitchen = await createCategory(db, 'Küche', 1);
        await createCategory(db, 'Bad');
        expect((await listCategories(db)).map((c) => c.name)).toEqual(['Bad', 'Küche']);
        expect(await updateCategory(db, kitchen.id, { name: 'Kitchen' })).toEqual({ id: kitchen.id, name: 'Kitchen', sort: 1 });
        expect(await getCategory(db, kitchen.id)).toMatchObject({ name: 'Kitchen' });

        const chore = await createChore(db, newChore({ categoryIds: [kitchen.id] }));
        expect(await deleteCategory(db, kitchen.id)).toBe(true);
        expect(await deleteCategory(db, kitchen.id)).toBe(false);
        expect((await getChore(db, chore.id))?.categoryIds).toEqual([]);
    });
});
