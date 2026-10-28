import { describe, expect, it } from 'vitest';
import { createCategory } from '../../src/db/categories.ts';
import { createChore, getChore, listChores, updateChore } from '../../src/db/chores.ts';
import { createCondition, setConditionResult } from '../../src/db/conditions.ts';
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
        expect(chore).toMatchObject({ id: 1, name: 'Boden', noisy: true, pausesWhenAway: false, personIds: [p.id],
            categoryIds: [1, 2] });
    });

    it('updates values and replaces links', async () => {
        const db = await memoryDb();
        const c1 = await createCategory(db, 'Küche');
        const chore = await createChore(db, newChore({ categoryIds: [c1.id] }));
        const updated = await updateChore(db, chore.id, { interval: 5, pausesWhenAway: true, noisy: true, categoryIds: [] });
        expect(updated).toMatchObject({ interval: 5, pausesWhenAway: true, noisy: true, categoryIds: [] });
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

    it('reads the results of the linked conditions', async () => {
        const db = await memoryDb();
        const requires = await createCondition(db, { name: 'Trocken', template: '{{ x }}' });
        const trigger = await createCondition(db, { name: 'Frost', template: '{{ y }}' });
        const chore = await createChore(db, newChore({ requiresId: requires.id, triggerId: trigger.id }));
        expect(chore).toMatchObject({ requiresResult: null, triggerResult: null, triggerSinceAt: null, templateError: null });
        await setConditionResult(db, requires.id, 1, null, 500);
        await setConditionResult(db, trigger.id, null, 'UndefinedError', 600);
        expect(await getChore(db, chore.id)).toMatchObject({ requiresResult: 1, triggerResult: null, triggerSinceAt: null,
            templateError: 'UndefinedError' });
        // a change from an error to true keeps the time, a change from false to true sets it
        await setConditionResult(db, trigger.id, 1, null, 650);
        expect((await getChore(db, chore.id))?.triggerSinceAt).toBeNull();
        await setConditionResult(db, trigger.id, 0, null, 660);
        await setConditionResult(db, trigger.id, 1, null, 700);
        expect((await listChores(db))[0]).toMatchObject({ requiresResult: 1, triggerResult: 1, triggerSinceAt: 700,
            templateError: null });
    });
});
