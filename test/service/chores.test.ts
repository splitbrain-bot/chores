import { describe, expect, it } from 'vitest';
import { DAY } from '../../src/core/types.ts';
import { createCategory, createPerson } from '../../src/service/admin.ts';
import { insertStates } from '../../src/db/ha_state.ts';
import { createChore, deleteChore, getChore, listChores, updateChore } from '../../src/service/chores.ts';
import { createCondition } from '../../src/service/conditions.ts';
import { getSuggestions } from '../../src/service/suggestions.ts';
import type { ChoreInput } from '../../src/schemas/chore.ts';
import { Clock, makeDeps } from './helpers.ts';

const base: ChoreInput = { name: 'Boden', kind: 'recurring', growth: 'time', interval: 8, importance: 'normal',
    durationMin: 15, effort: 2 };

describe('chore service', () => {
    it('creates a chore with defaults and links', async () => {
        const clock = new Clock('2026-10-26T20:00:00+01:00');
        const deps = await makeDeps(clock);
        let changed = 0;
        deps.onChoresChanged = () => changed++;
        const cat = await createCategory(deps, 'Küche');
        const p = await createPerson(deps, { name: 'Andi', haEntity: 'person.a' });
        const chore = await createChore(deps, { ...base, categoryIds: [cat.id], personIds: [p.id] });
        expect(chore).toMatchObject({ intervalMin: 1, intervalMax: 32, lastDoneAt: clock.t, createdAt: clock.t,
            categoryIds: [cat.id], personIds: [p.id], need: 0, noisy: false });
        expect(changed).toBe(1);
    });

    it('validates combinations and links', async () => {
        const deps = await makeDeps(new Clock('2026-10-26T20:00:00+01:00'));
        await expect(createChore(deps, { ...base, interval: undefined })).rejects.toMatchObject({ status: 400 });
        await expect(createChore(deps, { ...base, growth: 'counter' })).rejects.toMatchObject({ status: 400 });
        await expect(createChore(deps, { ...base, categoryIds: [9] })).rejects.toMatchObject({ status: 400 });
        await expect(createChore(deps, { ...base, conditionId: 9 })).rejects.toMatchObject({ status: 400 });
        const forecast = await createCondition(deps, { name: 'Trocken', kind: 'forecast', template: '{{ day.dry }}' });
        await expect(createChore(deps, { ...base, conditionId: forecast.id })).rejects.toMatchObject({ status: 400 });
        expect(await createChore(deps, { ...base, forecastId: forecast.id })).toMatchObject({ forecastId: forecast.id });
        expect(await createChore(deps, { ...base, seasonMonths: [9, 3, 3] })).toMatchObject({ seasonMonths: [3, 9] });
        expect(await createChore(deps, { ...base, seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }))
            .toMatchObject({ seasonMonths: [] });
        const task = await createChore(deps, { ...base, kind: 'one_time' });
        expect(task).toMatchObject({ interval: null, intervalMin: null });
    });

    it('updates, lists, gets and deletes', async () => {
        const clock = new Clock('2026-10-26T20:00:00+01:00');
        const deps = await makeDeps(clock);
        const a = await createCondition(deps, { name: 'A', kind: 'state', template: '{{ a }}' });
        const b = await createCondition(deps, { name: 'B', kind: 'state', template: '{{ b }}' });
        const chore = await createChore(deps, { ...base, conditionId: a.id, lastDoneAt: clock.t - 4 * DAY });
        await createChore(deps, { ...base, name: 'Fenster', kind: 'one_time' });
        const updated = await updateChore(deps, chore.id, { interval: 4, conditionId: b.id });
        expect(updated).toMatchObject({ interval: 4, intervalMin: 0.5, intervalMax: 16, conditionId: b.id });
        expect(updated.need).toBeCloseTo(1);
        const cleared = await updateChore(deps, chore.id, { conditionId: null, intervalMin: null, intervalMax: 10 });
        expect(cleared).toMatchObject({ conditionId: null, intervalMin: 0.5, intervalMax: 10 });

        expect((await listChores(deps, { q: 'fen' })).map((c) => c.name)).toEqual(['Fenster']);
        expect((await listChores(deps, { kind: 'recurring' })).map((c) => c.name)).toEqual(['Boden']);
        expect((await listChores(deps, { minNeed: 0.5 })).map((c) => c.name)).toEqual(['Boden']);

        await deleteChore(deps, chore.id);
        expect((await listChores(deps)).map((c) => c.name)).toEqual(['Fenster']);
        expect((await listChores(deps, { includeDeleted: true }))).toHaveLength(2);
        expect((await getChore(deps, chore.id)).chore.deletedAt).toBe(clock.t);
        await expect(updateChore(deps, chore.id, { name: 'x' })).rejects.toMatchObject({ status: 404 });
        await expect(deleteChore(deps, chore.id)).rejects.toMatchObject({ status: 404 });
    });

    it('lists the chores of other persons at home as possible but suggests only own chores', async () => {
        // Saturday morning, a slot with enough capacity
        const clock = new Clock('2026-10-31T09:00:00+01:00');
        const deps = await makeDeps(clock);
        const andi = await createPerson(deps, { name: 'Andi', haEntity: 'person.a' });
        const kaddi = await createPerson(deps, { name: 'Kaddi', haEntity: 'person.k' });
        await insertStates(deps.db, [
            { entityId: 'person.a', state: 'home', at: clock.t - DAY },
            { entityId: 'person.k', state: 'home', at: clock.t - DAY },
        ]);
        const deko = await createChore(deps, { ...base, name: 'Deko', personIds: [kaddi.id], lastDoneAt: clock.t - 10 * DAY });

        expect((await listChores(deps))[0]).toMatchObject({ id: deko.id, possible: true, blockedBy: [] });
        expect((await getChore(deps, deko.id)).chore).toMatchObject({ possible: true, blockedBy: [] });
        expect((await getSuggestions(deps, { kind: 'person', personId: andi.id })).suggestions).toEqual([]);
        expect((await getSuggestions(deps, { kind: 'person', personId: kaddi.id })).suggestions)
            .toMatchObject([{ chore: { id: deko.id } }]);
    });
});
