import { describe, expect, it } from 'vitest';
import { DAY } from '../../src/core/types.ts';
import { setCache } from '../../src/db/cache.ts';
import { insertStates } from '../../src/db/ha_state.ts';
import { createPerson } from '../../src/service/admin.ts';
import { createChore } from '../../src/service/chores.ts';
import { createCondition } from '../../src/service/conditions.ts';
import { FORECAST_KEY } from '../../src/service/evaluate.ts';
import { getLookahead } from '../../src/service/lookahead.ts';
import { getOverview } from '../../src/service/overview.ts';
import { Clock, makeDeps } from './helpers.ts';

describe('look-ahead and overview', () => {
    it('renders the forecast conditions once and gives hints', async () => {
        // Thursday
        const clock = new Clock('2026-10-29T12:00:00+01:00');
        const deps = await makeDeps(clock);
        await createPerson(deps, { name: 'Andi', haEntity: 'person.a' });
        await setCache(deps.db, FORECAST_KEY, [
            { datetime: '2026-10-30T11:00:00+00:00', condition: 'rainy', temperature: 9, precipitation: 3 },
            { datetime: '2026-10-31T11:00:00+00:00', condition: 'sunny', temperature: 12, precipitation: 0 },
        ], clock.t - 600_000);
        const dry = await createCondition(deps, { name: 'Trocken', kind: 'forecast',
            template: '{{ day.precipitation == 0 }}' });
        expect(dry.forecast).toEqual([{ date: '2026-10-30', result: false }, { date: '2026-10-31', result: true }]);
        const gutters = await createChore(deps, { name: 'Dachrinne', kind: 'recurring', growth: 'time', interval: 180,
            importance: 'normal', durationMin: 60, effort: 4, lastDoneAt: clock.t - 200 * DAY,
            forecastId: dry.id });

        const result = await getLookahead(deps);
        expect(result.forecastAge).toBe(600_000);
        expect(result.hints).toEqual([{ choreId: gutters.id, choreName: 'Dachrinne', date: '2026-10-31', reasons: [
            { code: 'weather', condition: 'sunny', temperature: 12, precipitation: 0 },
            { code: 'free_time', minutes: 285 },
        ] }]);
        const renders = deps.fake!.subscriptions.length;
        expect(renders).toBe(2);
        await getLookahead(deps);
        expect(deps.fake!.subscriptions.length).toBe(renders);
    });

    it('summarises the state', async () => {
        const clock = new Clock('2026-11-05T12:00:00+01:00');
        const deps = await makeDeps(clock);
        await createPerson(deps, { name: 'Andi', haEntity: 'person.a' });
        await insertStates(deps.db, [{ entityId: 'person.a', state: 'home', at: clock.t - DAY }]);
        await createChore(deps, { name: 'Sprenger', kind: 'recurring', growth: 'time', interval: 365,
            importance: 'critical', durationMin: 30, effort: 3, deadlineMd: '11-15' });
        await createChore(deps, { name: 'Alt', kind: 'recurring', growth: 'time', interval: 2, importance: 'normal',
            durationMin: 10, effort: 1, lastDoneAt: clock.t - 10 * DAY });
        const o = await getOverview(deps);
        expect(o.top.map((c) => c.name)).toEqual(['Sprenger', 'Alt']);
        expect(o.neglected.map((c) => c.name)).toEqual(['Sprenger', 'Alt']);
        expect(o.deadlines.map((d) => d.chore.name)).toEqual(['Sprenger']);
        expect(o.counts).toEqual({ byKind: { recurring: 2, one_time: 0 },
            byImportance: { optional: 0, normal: 1, important: 0, critical: 1 }, aboveOne: 2 });
        expect(o.presence[0]).toMatchObject({ name: 'Andi', home: true });
        expect(o.capacityNow[0]).toMatchObject({ name: 'Andi', capacity: { minutes: 10, energy: 2 } });
    });
});
