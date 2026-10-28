import { beforeEach, describe, expect, it } from 'vitest';
import { DAY, HOUR, type Viewer } from '../../src/core/types.ts';
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

const base: ChoreInput = { name: 'Boden wischen', kind: 'recurring', interval: 7, durationMin: 15, effort: 2 };

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
        const main = await createChore(deps, { ...base, lastDoneAt: clock.t - 8 * DAY });
        const other = await createChore(deps, { ...base, lastDoneAt: clock.t - 6 * DAY });
        await createChore(deps, { ...base, name: 'Fenster', lastDoneAt: clock.t - DAY });

        const result = await getSuggestions(deps, andi);
        expect(result.capacity).toEqual({ minutes: 120, energy: 5 });
        expect(result.suggestions).toHaveLength(1);
        expect(result.suggestions[0]!.chore.id).toBe(main.id);
        expect(result.suggestions[0]!.also.map((c) => c.id)).toEqual([other.id]);
        expect(result.presence).toMatchObject([{ name: 'Andi', home: true }]);

        const events = await markDone(deps, andi, main.id, [other.id]);
        expect(events.map((e) => e.choreId)).toEqual([main.id, other.id]);
        expect(events[0]!.earlier).toBe(true);
        const rows = await listChoreEvents(deps.db, main.id);
        expect(rows).toMatchObject([{ type: 'done', personId: andi.kind === 'person' ? andi.personId : null,
            durationMin: 15, effort: 2 }]);
        expect(rows[0]!.needLevel).toBeCloseTo(8 / 7);
        expect((await getChore(deps, other.id)).chore.lastDoneAt).toBe(clock.t);
        expect((await getSuggestions(deps, andi)).suggestions).toEqual([]);

        // the target is 8 * 0.75 = 6, the first signal goes half of the way
        clock.advance(2 * HOUR);
        const learned = await markEarlier(deps, andi, events[0]!.eventId);
        expect(learned.interval).toBeCloseTo(6.5);
        expect((await listChoreEvents(deps.db, main.id))[0]).toMatchObject({ type: 'earlier', intervalBefore: 7, intervalAfter: 6.5 });
        await expect(markEarlier(deps, andi, events[0]!.eventId)).rejects.toMatchObject({ status: 409 });
    });

    it('applies the whole target for a repeated earlier', async () => {
        const chore = await createChore(deps, { ...base, lastDoneAt: clock.t - 8 * DAY });
        const [first] = await markDone(deps, andi, chore.id);
        await markEarlier(deps, andi, first!.eventId);
        expect((await getChore(deps, chore.id)).chore.interval).toBeCloseTo(6.5);

        // the target is 6 * 0.75 = 4.5 and the second signal in the same direction applies it at once
        clock.advance(6 * DAY);
        const [second] = await markDone(deps, andi, chore.id);
        expect(second!.earlier).toBe(true);
        const learned = await markEarlier(deps, andi, second!.eventId);
        expect(learned.interval).toBeCloseTo(4.5);
    });

    it('refuses earlier for a chore that was done late', async () => {
        const chore = await createChore(deps, { ...base, lastDoneAt: clock.t - 14 * DAY });
        const [event] = await markDone(deps, andi, chore.id);
        expect(event!.earlier).toBe(false);
        await expect(markEarlier(deps, andi, event!.eventId)).rejects.toMatchObject({ status: 409 });
        expect((await getChore(deps, chore.id)).chore.interval).toBe(7);
    });

    it('refuses earlier when the chore has a newer event', async () => {
        const chore = await createChore(deps, { ...base, lastDoneAt: clock.t - 6 * DAY });
        const [event] = await markDone(deps, { kind: 'shared' }, chore.id);
        expect((await listChoreEvents(deps.db, chore.id))[0]).toMatchObject({ type: 'done', personId: null });
        await postpone(deps, andi, chore.id, 'no_time');
        await expect(markEarlier(deps, andi, event!.eventId)).rejects.toMatchObject({ status: 409 });
        expect((await getChore(deps, chore.id)).chore.interval).toBe(7);

        // without a newer event the tap has no time limit
        const other = await createChore(deps, { ...base, name: 'Fenster', lastDoneAt: clock.t - 6 * DAY });
        const [done] = await markDone(deps, andi, other.id);
        clock.advance(2 * DAY);
        expect((await markEarlier(deps, andi, done!.eventId)).interval).toBeCloseTo(5.75);
    });

    it('refuses earlier for the first done event of a chore without a known start', async () => {
        const chore = await createChore(deps, base);
        clock.advance(2 * DAY);
        const [first] = await markDone(deps, andi, chore.id);
        expect(first!.earlier).toBe(false);
        expect((await listChoreEvents(deps.db, chore.id))[0]).toMatchObject({ type: 'done', startKnown: false });
        await expect(markEarlier(deps, andi, first!.eventId)).rejects.toMatchObject({ status: 409 });
        expect((await getChore(deps, chore.id)).chore.interval).toBe(7);

        clock.advance(6 * DAY);
        const [second] = await markDone(deps, andi, chore.id);
        expect(second!.earlier).toBe(true);
        expect((await markEarlier(deps, andi, second!.eventId)).interval).toBeLessThan(7);
    });

    it('refuses not yet for a recurring chore without a known start', async () => {
        const chore = await createChore(deps, base);
        await expect(postpone(deps, andi, chore.id, 'not_yet')).rejects.toMatchObject({ status: 409 });
        expect((await postpone(deps, andi, chore.id, 'no_time')).blockedBy).toContain('snoozed');
        expect(await postpone(deps, andi, chore.id, 'no_energy')).toMatchObject({ interval: 7 });

        const task = await createChore(deps, { ...base, kind: 'one_time', interval: undefined });
        expect((await postpone(deps, andi, task.id, 'not_yet')).snoozedUntil).toBe(clock.t + 7 * DAY);
    });

    it('deletes a done one-time task', async () => {
        const task = await createChore(deps, { ...base, kind: 'one_time', interval: undefined });
        const [event] = await markDone(deps, andi, task.id);
        expect(event!.earlier).toBe(false);
        expect((await getChore(deps, task.id)).chore.deletedAt).toBe(clock.t);
        await expect(markDone(deps, andi, task.id)).rejects.toMatchObject({ status: 404 });
    });

    it('postpones until the next slot or until the chore is due again', async () => {
        const chore = await createChore(deps, { ...base, lastDoneAt: clock.t - 10 * DAY });
        const later = await postpone(deps, andi, chore.id, 'no_time');
        expect(later.snoozedUntil).toBe(Date.parse('2026-10-31T12:00:00+01:00'));
        expect(later.blockedBy).toContain('snoozed');

        // the target is 10 * 1.25 = 12.5, the first signal goes half of the way
        const notYet = await postpone(deps, andi, chore.id, 'not_yet');
        expect(notYet.interval).toBeCloseTo(9.75);
        expect(notYet.snoozedUntil).toBe(clock.t + DAY);
        expect((await listChoreEvents(deps.db, chore.id)).map((e) => e.reason)).toEqual(['not_yet', 'no_time']);

        // the second signal in the same direction applies the whole target
        const again = await postpone(deps, andi, chore.id, 'not_yet');
        expect(again.interval).toBeCloseTo(12.5);
        expect(again.snoozedUntil).toBe(clock.t + 2.5 * DAY);
    });

    it('lowers the capacity for the rest of the slot after no time or no energy', async () => {
        const chore = await createChore(deps, { ...base, lastDoneAt: clock.t - 10 * DAY });
        await postpone(deps, andi, chore.id, 'no_time');
        expect((await listChoreEvents(deps.db, chore.id))[0]).toMatchObject({ reason: 'no_time', durationMin: 15, effort: 2 });
        expect((await getSuggestions(deps, andi)).capacity).toEqual({ minutes: 14, energy: 5 });

        await postpone(deps, { kind: 'shared' }, chore.id, 'no_energy');
        expect((await getSuggestions(deps, andi)).capacity).toEqual({ minutes: 14, energy: 1 });

        // the next slot starts at noon with its full capacity
        clock.advance(4 * HOUR);
        expect((await getSuggestions(deps, andi)).capacity).toEqual({ minutes: 120, energy: 4 });
    });

    it('refuses a done time in the future', async () => {
        const chore = await createChore(deps, base);
        await expect(markDone(deps, andi, chore.id, [], clock.t + 1000)).rejects.toMatchObject({ status: 400 });
    });
});
