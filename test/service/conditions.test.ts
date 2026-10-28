import { describe, expect, it } from 'vitest';
import { getCache, setCache } from '../../src/db/cache.ts';
import { setConditionResult } from '../../src/db/conditions.ts';
import { createChore, deleteChore } from '../../src/service/chores.ts';
import { createCondition, deleteCondition, listConditions, updateCondition } from '../../src/service/conditions.ts';
import { FORECAST_KEY } from '../../src/service/evaluate.ts';
import { Clock, makeDeps } from './helpers.ts';

const chore = { name: 'Rasen', kind: 'recurring', interval: 7, durationMin: 30, effort: 3 } as const;

describe('condition service', () => {
    it('lists the conditions with their status', async () => {
        const clock = new Clock('2026-10-29T12:00:00+01:00');
        const deps = await makeDeps(clock);
        let changed = 0;
        deps.onConditionsChanged = () => changed++;
        await setCache(deps.db, FORECAST_KEY, [
            { datetime: '2026-10-30T11:00:00+00:00', precipitation: 0 },
        ], clock.t);
        const dry = await createCondition(deps, { name: 'Trocken', template: '{{ dry }}' });
        const sun = await createCondition(deps, { name: 'Sonnig', template: 'true',
            forecastTemplate: '{{ day.precipitation == 0 }}' });
        expect(changed).toBe(2);
        await setConditionResult(deps.db, dry.id, 1, null, clock.t);
        const rasen = await createChore(deps, { ...chore, requiresId: dry.id, triggerId: sun.id });

        expect(await listConditions(deps)).toEqual([
            { id: sun.id, name: 'Sonnig', template: 'true', forecastTemplate: '{{ day.precipitation == 0 }}', result: null,
                error: null, sinceAt: null, icon: null, choreIds: [rasen.id], forecast: [{ date: '2026-10-30', result: true }] },
            { id: dry.id, name: 'Trocken', template: '{{ dry }}', forecastTemplate: null, result: 1, error: null,
                sinceAt: clock.t, icon: null, choreIds: [rasen.id], forecast: [] },
        ]);
        await expect(createCondition(deps, { name: 'Trocken', template: '{{ x }}' }))
            .rejects.toMatchObject({ status: 409 });
    });

    it('renames, changes and deletes a condition', async () => {
        const clock = new Clock('2026-10-29T12:00:00+01:00');
        const deps = await makeDeps(clock);
        const sun = await createCondition(deps, { name: 'Sonnig', template: '{{ a }}', forecastTemplate: '{{ day.a }}' });
        await createCondition(deps, { name: 'Trocken', template: '{{ dry }}' });
        await setCache(deps.db, `forecast_template:${sun.id}:2026-10-30`, true, clock.t);

        expect(await updateCondition(deps, sun.id, { name: 'Sonne' }))
            .toMatchObject({ name: 'Sonne', template: '{{ a }}', forecastTemplate: '{{ day.a }}' });
        expect(await getCache(deps.db, `forecast_template:${sun.id}:2026-10-30`)).toBeDefined();
        // a change of the template keeps the cached forecast results, a change of the forecast template clears them
        await updateCondition(deps, sun.id, { template: '{{ b }}' });
        expect(await getCache(deps.db, `forecast_template:${sun.id}:2026-10-30`)).toBeDefined();
        expect(await updateCondition(deps, sun.id, { forecastTemplate: null })).toMatchObject({ forecastTemplate: null });
        expect(await getCache(deps.db, `forecast_template:${sun.id}:2026-10-30`)).toBeUndefined();
        await expect(updateCondition(deps, sun.id, { name: 'Trocken' })).rejects.toMatchObject({ status: 409 });
        await expect(updateCondition(deps, 99, { name: 'x' })).rejects.toMatchObject({ status: 404 });

        const rasen = await createChore(deps, { ...chore, requiresId: sun.id });
        await expect(deleteCondition(deps, sun.id)).rejects.toMatchObject({ status: 409 });
        await deleteChore(deps, rasen.id);
        await deleteCondition(deps, sun.id);
        expect((await listConditions(deps)).map((c) => c.name)).toEqual(['Trocken']);
        await expect(deleteCondition(deps, sun.id)).rejects.toMatchObject({ status: 404 });
    });
});
