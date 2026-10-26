import { beforeEach, describe, expect, it } from 'vitest';
import { DAY, type Viewer } from '../../src/core/types.ts';
import { listChoreEvents } from '../../src/db/events.ts';
import { createPerson } from '../../src/db/persons.ts';
import { insertStates } from '../../src/db/ha_state.ts';
import { replaceOccupancy } from '../../src/db/occupancy.ts';
import { createChore, getChore } from '../../src/service/chores.ts';
import type { Deps } from '../../src/service/deps.ts';
import { markDone, markEarlier, postpone } from '../../src/service/feedback.ts';
import { getSuggestions } from '../../src/service/suggestions.ts';
import type { ChoreInput } from '../../src/schemas/chore.ts';
import { Clock, makeDeps } from './helpers.ts';

const base: ChoreInput = { name: 'Boden wischen', kind: 'recurring', growth: 'time', interval: 7, importance: 'normal',
    durationMin: 15, effort: 2, assignment: 'any' };

describe('done flow', () => {
    // Saturday morning slot with 120 minutes
    let clock: Clock;
    let deps: Deps;
    let andi: Viewer;

    beforeEach(async () => {
        clock = new Clock('2026-10-31T09:00:00+01:00');
        deps = await makeDeps(clock);
        const p = await createPerson(deps.db, { name: 'Andi', haEntity: 'person.a' });
        await insertStates(deps.db, [{ entityId: 'person.a', state: 'home', at: clock.t - DAY }]);
        await replaceOccupancy(deps.db, [{ startAt: clock.t - DAY, endAt: null, clockStart: 0 }]);
        andi = { kind: 'person', personId: p.id };
    });

    it('suggests a due chore, records done with the group, and learns from earlier', async () => {
        const main = await createChore(deps, { ...base, groupKey: 'boden', lastDoneAt: clock.t - 10 * DAY });
        const other = await createChore(deps, { ...base, name: 'Boden Bad', groupKey: 'boden', lastDoneAt: clock.t - 6 * DAY });
        await createChore(deps, { ...base, name: 'Fenster', lastDoneAt: clock.t - DAY });

        const result = await getSuggestions(deps, andi);
        expect(result.capacity).toEqual({ minutes: 120, energy: 5 });
        expect(result.suggestions).toHaveLength(1);
        expect(result.suggestions[0]!.chore.id).toBe(main.id);
        expect(result.suggestions[0]!.also.map((c) => c.id)).toEqual([other.id]);
        expect(result.presence).toMatchObject([{ name: 'Andi', home: true }]);

        const events = await markDone(deps, andi, main.id, [other.id]);
        expect(events.map((e) => e.choreId)).toEqual([main.id, other.id]);
        const rows = await listChoreEvents(deps.db, main.id);
        expect(rows).toMatchObject([{ type: 'done', personId: andi.kind === 'person' ? andi.personId : null, effort: 2 }]);
        expect(rows[0]!.needLevel).toBeCloseTo(10 / 7);
        expect((await getChore(deps, andi, other.id)).chore.lastDoneAt).toBe(clock.t);
        expect((await getSuggestions(deps, andi)).suggestions).toEqual([]);

        clock.advance(5000);
        const learned = await markEarlier(deps, andi, events[0]!.eventId);
        expect(learned.interval).toBeCloseTo(5.95);
        expect((await listChoreEvents(deps.db, main.id))[0]).toMatchObject({ type: 'earlier', intervalBefore: 7 });
        await expect(markEarlier(deps, andi, events[0]!.eventId)).rejects.toMatchObject({ status: 409 });
    });

    it('refuses earlier for a chore that was done late', async () => {
        const chore = await createChore(deps, { ...base, lastDoneAt: clock.t - 14 * DAY });
        const [event] = await markDone(deps, andi, chore.id);
        expect(event!.earlier).toBe(false);
        await expect(markEarlier(deps, andi, event!.eventId)).rejects.toMatchObject({ status: 409 });
        expect((await getChore(deps, andi, chore.id)).chore.interval).toBe(7);
    });

    it('refuses earlier after one minute', async () => {
        const chore = await createChore(deps, base);
        const [event] = await markDone(deps, { kind: 'shared' }, chore.id);
        clock.advance(61_000);
        await expect(markEarlier(deps, andi, event!.eventId)).rejects.toMatchObject({ status: 409 });
        expect((await listChoreEvents(deps.db, chore.id))[0]).toMatchObject({ type: 'done', personId: null });
    });

    it('deletes a done one-time task', async () => {
        const task = await createChore(deps, { ...base, kind: 'one_time', interval: undefined });
        await markDone(deps, andi, task.id);
        expect((await getChore(deps, andi, task.id)).chore.deletedAt).toBe(clock.t);
        await expect(markDone(deps, andi, task.id)).rejects.toMatchObject({ status: 404 });
    });

    it('postpones until the next slot or until the chore is due again', async () => {
        const chore = await createChore(deps, { ...base, lastDoneAt: clock.t - 10 * DAY });
        const later = await postpone(deps, andi, chore.id, 'no_time');
        expect(later.snoozedUntil).toBe(Date.parse('2026-10-31T12:00:00+01:00'));
        expect(later.blockedBy).toContain('snoozed');

        const notYet = await postpone(deps, andi, chore.id, 'not_yet');
        expect(notYet.interval).toBeCloseTo(8.05);
        expect(notYet.snoozedUntil).toBe(clock.t + DAY);
        expect((await listChoreEvents(deps.db, chore.id)).map((e) => e.reason)).toEqual(['not_yet', 'no_time']);
    });

    it('refuses a done time in the future', async () => {
        const chore = await createChore(deps, base);
        await expect(markDone(deps, andi, chore.id, [], clock.t + 1000)).rejects.toMatchObject({ status: 400 });
    });
});
