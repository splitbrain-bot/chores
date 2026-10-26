import { describe, expect, it } from 'vitest';
import { DAY } from '../../src/core/types.ts';
import { createCategory, createPerson } from '../../src/service/admin.ts';
import { createChore, deleteChore, getChore, listChores, updateChore } from '../../src/service/chores.ts';
import type { ChoreInput } from '../../src/schemas/chore.ts';
import { Clock, makeDeps } from './helpers.ts';

const base: ChoreInput = { name: 'Boden', kind: 'recurring', growth: 'time', interval: 8, importance: 'normal',
    durationMin: 15, effort: 2, assignment: 'any' };
const shared = { kind: 'shared' } as const;

describe('chore service', () => {
    it('creates a chore with defaults and links', async () => {
        const clock = new Clock('2026-10-26T20:00:00+01:00');
        const deps = await makeDeps(clock);
        let changed = 0;
        deps.onChoresChanged = () => changed++;
        const cat = await createCategory(deps, 'Küche');
        const p = await createPerson(deps, { name: 'Andi', haEntity: 'person.a' });
        const chore = await createChore(deps, { ...base, categoryIds: [cat.id], personIds: [p.id] });
        expect(chore).toMatchObject({ intervalMin: 2, intervalMax: 32, lastDoneAt: clock.t, createdAt: clock.t,
            categoryIds: [cat.id], personIds: [p.id], need: 0, noisy: false });
        expect(changed).toBe(1);
    });

    it('validates combinations and links', async () => {
        const deps = await makeDeps(new Clock('2026-10-26T20:00:00+01:00'));
        await expect(createChore(deps, { ...base, interval: undefined })).rejects.toMatchObject({ status: 400 });
        await expect(createChore(deps, { ...base, growth: 'counter' })).rejects.toMatchObject({ status: 400 });
        await expect(createChore(deps, { ...base, seasonFrom: 4 })).rejects.toMatchObject({ status: 400 });
        await expect(createChore(deps, { ...base, categoryIds: [9] })).rejects.toMatchObject({ status: 400 });
        const task = await createChore(deps, { ...base, kind: 'one_time' });
        expect(task).toMatchObject({ interval: null, intervalMin: null });
    });

    it('updates, lists, gets and deletes', async () => {
        const clock = new Clock('2026-10-26T20:00:00+01:00');
        const deps = await makeDeps(clock);
        const chore = await createChore(deps, { ...base, conditionTemplate: '{{ a }}', lastDoneAt: clock.t - 4 * DAY });
        await createChore(deps, { ...base, name: 'Fenster', kind: 'one_time' });
        const updated = await updateChore(deps, chore.id, { interval: 4, conditionTemplate: '{{ b }}' });
        expect(updated).toMatchObject({ interval: 4, intervalMin: 1, intervalMax: 16, conditionResult: null });
        expect(updated.need).toBeCloseTo(1);
        const cleared = await updateChore(deps, chore.id, { conditionTemplate: null, intervalMin: null, intervalMax: 10 });
        expect(cleared).toMatchObject({ conditionTemplate: null, intervalMin: 1, intervalMax: 10 });

        expect((await listChores(deps, shared, { q: 'fen' })).map((c) => c.name)).toEqual(['Fenster']);
        expect((await listChores(deps, shared, { kind: 'recurring' })).map((c) => c.name)).toEqual(['Boden']);
        expect((await listChores(deps, shared, { minNeed: 0.5 })).map((c) => c.name)).toEqual(['Boden']);

        await deleteChore(deps, chore.id);
        expect((await listChores(deps, shared)).map((c) => c.name)).toEqual(['Fenster']);
        expect((await listChores(deps, shared, { includeDeleted: true }))).toHaveLength(2);
        expect((await getChore(deps, shared, chore.id)).chore.deletedAt).toBe(clock.t);
        await expect(updateChore(deps, chore.id, { name: 'x' })).rejects.toMatchObject({ status: 404 });
        await expect(deleteChore(deps, chore.id)).rejects.toMatchObject({ status: 404 });
    });
});
