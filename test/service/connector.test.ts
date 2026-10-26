import { describe, expect, it } from 'vitest';
import { HOUR } from '../../src/core/types.ts';
import { getChore as loadChore } from '../../src/db/chores.ts';
import { insertStates, listStates } from '../../src/db/ha_state.ts';
import { listOccupancy } from '../../src/db/occupancy.ts';
import { createPerson } from '../../src/db/persons.ts';
import { TemplateManager } from '../../src/ha/templates.ts';
import { Watcher } from '../../src/ha/watcher.ts';
import { createChore } from '../../src/service/chores.ts';
import { listPresence, watchList } from '../../src/service/presence.ts';
import { Clock, FakeApi, makeDeps } from './helpers.ts';

const t0 = Date.parse('2026-10-26T06:00:00+01:00');

describe('occupancy update', () => {
    it('follows a sequence of person states with unavailable', async () => {
        const clock = new Clock('2026-10-26T20:00:00+01:00');
        const deps = await makeDeps(clock);
        await createPerson(deps.db, { name: 'Andi', haEntity: 'person.a' });
        await createPerson(deps.db, { name: 'Kaddi', haEntity: 'person.k' });
        const watcher = new Watcher(deps.db, deps.ha!);
        await watcher.setEntities(await watchList(deps.db));

        const seq: [string, string, number][] = [
            ['person.a', 'home', 0], ['person.k', 'home', 0],
            ['person.a', 'not_home', 1], ['person.k', 'unavailable', 2], ['person.k', 'not_home', 3],
            ['person.k', 'unavailable', 4], ['person.a', 'unknown', 5], ['person.a', 'home', 6],
            ['person.a', 'not_home', 7],
        ];
        for (const [entityId, state, h] of seq) await watcher.handleState({ entityId, state, at: t0 + h * HOUR });

        expect(await listOccupancy(deps.db)).toEqual([
            { startAt: t0, endAt: t0 + 3 * HOUR, clockStart: 0 },
            { startAt: t0 + 6 * HOUR, endAt: t0 + 7 * HOUR, clockStart: 3 * HOUR },
        ]);
        const presence = await listPresence(deps);
        expect(presence.map((p) => [p.name, p.home, p.since])).toEqual([
            ['Andi', false, t0 + 7 * HOUR], ['Kaddi', false, t0 + 3 * HOUR],
        ]);
    });
});

describe('gap fill', () => {
    it('inserts the missed states and rebuilds the occupancy', async () => {
        const clock = new Clock('2026-10-26T20:00:00+01:00');
        const deps = await makeDeps(clock);
        const fake = deps.fake!;
        await createPerson(deps.db, { name: 'Andi', haEntity: 'person.a', distanceEntity: 'sensor.d' });
        await insertStates(deps.db, [{ entityId: 'person.a', state: 'home', at: t0 }]);
        fake.history = [
            { entityId: 'person.a', state: 'home', at: t0 },
            { entityId: 'sensor.d', state: '0.0', at: t0 },
            { entityId: 'person.a', state: 'not_home', at: t0 + HOUR },
            { entityId: 'sensor.d', state: '42.1', at: t0 + 2 * HOUR },
        ];
        const watcher = new Watcher(deps.db, fake);
        await watcher.setEntities(await watchList(deps.db));
        await watcher.gapFill(clock.t);

        expect((await listStates(deps.db, ['person.a', 'sensor.d'])).map((s) => `${s.entityId}=${s.state}`)).toEqual([
            'person.a=home', 'sensor.d=0.0', 'person.a=not_home', 'sensor.d=42.1',
        ]);
        expect(await listOccupancy(deps.db)).toEqual([{ startAt: t0, endAt: t0 + HOUR, clockStart: 0 }]);
        expect((await listPresence(deps))[0]).toMatchObject({ home: false, distanceKm: 42.1 });
    });

    it('records the current states after a gap longer than the history', async () => {
        const clock = new Clock('2026-11-20T20:00:00+01:00');
        const deps = await makeDeps(clock);
        await createPerson(deps.db, { name: 'Andi', haEntity: 'person.a' });
        await insertStates(deps.db, [{ entityId: 'person.a', state: 'not_home', at: t0 }]);
        deps.fake!.states = [{ entityId: 'x', entity_id: 'person.a', state: 'home', last_changed: '' } as never];
        const watcher = new Watcher(deps.db, deps.fake!);
        await watcher.setEntities(await watchList(deps.db));
        await watcher.gapFill(clock.t);
        expect(await listOccupancy(deps.db)).toEqual([{ startAt: clock.t, endAt: null, clockStart: 0 }]);
    });
});

describe('template results', () => {
    it('updates the chore and the suggestions filter', async () => {
        const clock = new Clock('2026-10-26T20:00:00+01:00');
        const deps = await makeDeps(clock);
        const fake = deps.fake as FakeApi;
        const chore = await createChore(deps, { name: 'Rasen', kind: 'recurring', growth: 'time', interval: 7,
            importance: 'normal', durationMin: 30, effort: 3, assignment: 'any', conditionTemplate: '{{ dry }}' });
        const templates = new TemplateManager(deps.db, fake);
        await templates.sync([await loadChore(deps.db, chore.id)].filter((c) => c !== undefined));
        const sub = fake.subscriptions.find((s) => s.message.type === 'render_template')!;
        sub.callback({ result: true });
        await new Promise((r) => setTimeout(r, 10));
        expect((await loadChore(deps.db, chore.id))?.conditionResult).toBe(1);
        sub.callback({ error: 'boom' });
        await new Promise((r) => setTimeout(r, 10));
        expect(await loadChore(deps.db, chore.id)).toMatchObject({ conditionResult: null, templateError: 'boom' });

        await templates.sync([]);
        expect(sub.closed).toBe(true);
    });
});
