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
        const b = await createCondition(db, { name: 'Trocken', kind: 'state', template: '{{ a }}' });
        await createCondition(db, { name: 'Sonnig', kind: 'forecast', template: '{{ day.sun }}' });
        expect((await listConditions(db)).map((c) => c.name)).toEqual(['Sonnig', 'Trocken']);
        await expect(createCondition(db, { name: 'Trocken', kind: 'state', template: '{{ b }}' })).rejects.toThrow(/UNIQUE/);

        await setConditionResult(db, b.id, 1, null);
        expect(await updateCondition(db, b.id, { name: 'Draußen trocken' }))
            .toMatchObject({ name: 'Draußen trocken', template: '{{ a }}', result: 1 });
        expect(await updateCondition(db, b.id, { template: '{{ a }}' })).toMatchObject({ result: 1 });
        expect(await updateCondition(db, b.id, { template: '{{ c }}' })).toMatchObject({ template: '{{ c }}', result: null });
        expect(await updateCondition(db, b.id, { icon: 'weather-sunny' })).toMatchObject({ icon: 'weather-sunny', result: null });
        expect(await updateCondition(db, 99, { name: 'x' })).toBeUndefined();
    });

    it('lists the active chores of a condition and deletes the links of deleted chores', async () => {
        const db = await memoryDb();
        const cond = await createCondition(db, { name: 'Trocken', kind: 'state', template: '{{ a }}' });
        const active = await createChore(db, newChore({ conditionId: cond.id, boostId: cond.id }));
        const deleted = await createChore(db, newChore({ conditionId: cond.id, deletedAt: 5 }));
        expect(await conditionUses(db)).toEqual(new Map([[cond.id, [active.id]]]));

        await expect(deleteCondition(db, cond.id)).rejects.toThrow(/FOREIGN KEY/);
        await db.updateTable('chore').set({ conditionId: null, boostId: null }).where('id', '=', active.id).execute();
        expect(await deleteCondition(db, cond.id)).toBe(true);
        expect(await getCondition(db, cond.id)).toBeUndefined();
        expect((await db.selectFrom('chore').select('conditionId').where('id', '=', deleted.id).executeTakeFirst())?.conditionId)
            .toBeNull();
        expect(await deleteCondition(db, cond.id)).toBe(false);
    });
});
