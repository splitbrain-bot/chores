import { describe, expect, it } from 'vitest';
import { createChore } from '../../src/db/chores.ts';
import {
    conditionUses, createCondition, deleteCondition, getCondition, listConditions, setConditionResult, updateCondition,
} from '../../src/db/conditions.ts';
import { newChore } from './fixtures.ts';
import { memoryDb } from './helpers.ts';

describe('conditions', () => {
    it('creates, lists and changes conditions', async () => {
        const db = await memoryDb();
        const b = await createCondition(db, { name: 'Trocken', template: '{{ a }}' });
        const sunny = await createCondition(db, { name: 'Sonnig', template: '{{ sun }}', forecastTemplate: '{{ day.sun }}' });
        expect(sunny).toMatchObject({ template: '{{ sun }}', forecastTemplate: '{{ day.sun }}', sinceAt: null });
        expect(b.forecastTemplate).toBeNull();
        expect((await listConditions(db)).map((c) => c.name)).toEqual(['Sonnig', 'Trocken']);
        await expect(createCondition(db, { name: 'Trocken', template: '{{ b }}' })).rejects.toThrow(/UNIQUE/);

        await setConditionResult(db, b.id, 1, null, 100);
        expect(await updateCondition(db, b.id, { name: 'Draußen trocken' }))
            .toMatchObject({ name: 'Draußen trocken', template: '{{ a }}', result: 1, sinceAt: 100 });
        expect(await updateCondition(db, b.id, { template: '{{ a }}' })).toMatchObject({ result: 1, sinceAt: 100 });
        expect(await updateCondition(db, b.id, { forecastTemplate: '{{ day.a }}' }))
            .toMatchObject({ forecastTemplate: '{{ day.a }}', result: 1, sinceAt: 100 });
        expect(await updateCondition(db, b.id, { template: '{{ c }}' }))
            .toMatchObject({ template: '{{ c }}', result: null, error: null, sinceAt: null });
        expect(await updateCondition(db, b.id, { icon: 'weather-sunny' })).toMatchObject({ icon: 'weather-sunny', result: null });
        expect(await updateCondition(db, b.id, { forecastTemplate: null })).toMatchObject({ forecastTemplate: null });
        expect(await updateCondition(db, 99, { name: 'x' })).toBeUndefined();
    });

    it('records the time at which the result becomes true', async () => {
        const db = await memoryDb();
        const c = await createCondition(db, { name: 'Frost', template: '{{ a }}' });
        // the first result of a new template
        await setConditionResult(db, c.id, 1, null, 100);
        expect(await getCondition(db, c.id)).toMatchObject({ result: 1, sinceAt: 100 });
        // the same result again, for example after a restart
        await setConditionResult(db, c.id, 1, null, 200);
        expect(await getCondition(db, c.id)).toMatchObject({ result: 1, sinceAt: 100 });
        // an error and the recovery from it
        await setConditionResult(db, c.id, null, 'boom', 300);
        expect(await getCondition(db, c.id)).toMatchObject({ result: null, error: 'boom', sinceAt: 100 });
        await setConditionResult(db, c.id, 1, null, 400);
        expect(await getCondition(db, c.id)).toMatchObject({ result: 1, error: null, sinceAt: 100 });
        // a change from false to true
        await setConditionResult(db, c.id, 0, null, 500);
        expect(await getCondition(db, c.id)).toMatchObject({ result: 0, sinceAt: 100 });
        await setConditionResult(db, c.id, 1, null, 600);
        expect(await getCondition(db, c.id)).toMatchObject({ result: 1, sinceAt: 600 });
        // a new template with an error before its first result true
        const d = await createCondition(db, { name: 'Kaputt', template: '{{ b' });
        await setConditionResult(db, d.id, null, 'syntax', 700);
        await setConditionResult(db, d.id, 1, null, 800);
        expect(await getCondition(db, d.id)).toMatchObject({ result: 1, sinceAt: null });
        await setConditionResult(db, 99, 1, null, 900);
    });

    it('lists the active chores of a condition and deletes the links of deleted chores', async () => {
        const db = await memoryDb();
        const cond = await createCondition(db, { name: 'Trocken', template: '{{ a }}' });
        const other = await createCondition(db, { name: 'Frost', template: '{{ b }}' });
        const active = await createChore(db, newChore({ requiresId: cond.id, triggerId: cond.id }));
        const triggered = await createChore(db, newChore({ triggerId: other.id }));
        const deleted = await createChore(db, newChore({ requiresId: cond.id, triggerId: other.id, deletedAt: 5 }));
        expect(await conditionUses(db)).toEqual(new Map([[cond.id, [active.id]], [other.id, [triggered.id]]]));

        await expect(deleteCondition(db, cond.id)).rejects.toThrow(/FOREIGN KEY/);
        await db.updateTable('chore').set({ requiresId: null, triggerId: null }).where('id', '=', active.id).execute();
        expect(await deleteCondition(db, cond.id)).toBe(true);
        expect(await getCondition(db, cond.id)).toBeUndefined();
        expect(await db.selectFrom('chore').select(['requiresId', 'triggerId']).where('id', '=', deleted.id).executeTakeFirst())
            .toEqual({ requiresId: null, triggerId: other.id });
        expect(await deleteCondition(db, cond.id)).toBe(false);
    });
});
