import { describe, expect, it } from 'vitest';
import { createCategory } from '../../src/db/categories.ts';
import { createChore, getChore, listChores, setTemplateResult, updateChore } from '../../src/db/chores.ts';
import { createPerson } from '../../src/db/persons.ts';
import { newChore } from './fixtures.ts';
import { memoryDb } from './helpers.ts';

describe('chores', () => {
    it('creates a chore with links and reads it back', async () => {
        const db = await memoryDb();
        const p = await createPerson(db, { name: 'Andi', haEntity: 'person.a' });
        const c1 = await createCategory(db, 'Küche');
        const c2 = await createCategory(db, 'Bad');
        const chore = await createChore(db, newChore({ name: 'Boden', noisy: true, personIds: [p.id],
            categoryIds: [c2.id, c1.id] }));
        expect(chore).toMatchObject({ id: 1, name: 'Boden', noisy: true, personIds: [p.id], categoryIds: [1, 2],
            learnDirection: 0 });
    });

    it('updates values and replaces links', async () => {
        const db = await memoryDb();
        const c1 = await createCategory(db, 'Küche');
        const chore = await createChore(db, newChore({ categoryIds: [c1.id] }));
        const updated = await updateChore(db, chore.id, { interval: 5, learnDirection: -1, noisy: true, categoryIds: [] });
        expect(updated).toMatchObject({ interval: 5, learnDirection: -1, noisy: true, categoryIds: [] });
        const kept = await updateChore(db, chore.id, { name: 'Neu' });
        expect(kept).toMatchObject({ name: 'Neu', interval: 5 });
        expect(await updateChore(db, 99, { name: 'x' })).toBeUndefined();
    });

    it('lists active chores and optionally the deleted ones', async () => {
        const db = await memoryDb();
        await createChore(db, newChore({ name: 'B' }));
        await createChore(db, newChore({ name: 'A', deletedAt: 5 }));
        await createChore(db, newChore({ name: 'C' }));
        expect((await listChores(db)).map((c) => c.name)).toEqual(['B', 'C']);
        expect((await listChores(db, { includeDeleted: true })).map((c) => c.name)).toEqual(['A', 'B', 'C']);
        expect((await listChores(db, { ids: [3] })).map((c) => c.name)).toEqual(['C']);
        expect(await listChores(db, { ids: [] })).toEqual([]);
    });

    it('stores template results', async () => {
        const db = await memoryDb();
        const chore = await createChore(db, newChore({ conditionTemplate: '{{ x }}' }));
        await setTemplateResult(db, chore.id, 'condition', 1, null);
        expect(await getChore(db, chore.id)).toMatchObject({ conditionResult: 1, templateError: null });
        await setTemplateResult(db, chore.id, 'boost', null, 'UndefinedError');
        expect(await getChore(db, chore.id)).toMatchObject({ boostResult: null, templateError: 'UndefinedError' });
    });
});
