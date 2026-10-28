import { describe, expect, it } from 'vitest';
import { done, earlier, earlierAllowed, learnDirection, postpone, type PostponeContext } from '../../src/core/feedback.ts';
import { DAY, type ChoreEvent } from '../../src/core/types.ts';
import { at, makeChore, settings } from './fixtures.ts';

const now = at('2026-10-26T18:00+01:00');

/**
 * Creates a stored done event.
 */
function stored(choreId: number, needLevel = 1): ChoreEvent {
    return { id: 9, choreId, type: 'done', reason: null, at: now - 30_000, personId: 1, needLevel, intervalBefore: 10,
        intervalAfter: 10, durationMin: 10, effort: 2 };
}

/**
 * Creates a postpone context.
 */
function pctx(over: Partial<PostponeContext> = {}): PostponeContext {
    return { now, need: 1, elapsed: 7, nextSlotAt: now + 3_600_000, lastLearn: null, settings, personId: 1, ...over };
}

describe('done', () => {
    it('resets the chore and records the event', () => {
        const chore = makeChore({ snoozedUntil: now + DAY });
        const result = done(chore, now, 1.2, 1);
        expect(result.update).toMatchObject({ lastDoneAt: now, snoozedUntil: null });
        expect(result.update.deletedAt).toBeUndefined();
        expect(result.event).toMatchObject({ type: 'done', needLevel: 1.2, personId: 1, durationMin: 10, effort: 2 });
    });

    it('deletes a one-time task', () => {
        expect(done(makeChore({ kind: 'one_time' }), now, 1, null).update.deletedAt).toBe(now);
    });
});

describe('earlierAllowed', () => {
    it('allows the tap while it can shorten the interval', () => {
        const chore = makeChore({ interval: 10 });
        expect(earlierAllowed(chore, { needLevel: 1.3, intervalBefore: 10 }, settings)).toBe(true);
        expect(earlierAllowed(chore, { needLevel: 1.4, intervalBefore: 10 }, settings)).toBe(false);
        expect(earlierAllowed(makeChore({ kind: 'one_time' }), { needLevel: 0.5, intervalBefore: null }, settings)).toBe(false);
    });

    it('refuses the tap for an urgent chore, because its need level has no elapsed time', () => {
        const chore = makeChore({ interval: 10 });
        expect(earlierAllowed(chore, { needLevel: 10, intervalBefore: 10 }, settings)).toBe(false);
    });
});

describe('earlier', () => {
    const chore = makeChore({ interval: 10 });

    it('shortens the interval toward the observed time', () => {
        const event = stored(1);
        const result = earlier(chore, event, event, null, now, 1, settings);
        expect(result).toMatchObject({ update: { interval: 8.75 }, event: { type: 'earlier', intervalBefore: 10,
            intervalAfter: 8.75, durationMin: 10 } });
    });

    it('moves to the target at once after an earlier tap', () => {
        const event = stored(1);
        expect(earlier(chore, event, event, -1, now, 1, settings)).toMatchObject({ update: { interval: 7.5 } });
    });

    it('refuses a done event that is not the last event', () => {
        const event = stored(1);
        expect(earlier(chore, event, { ...event, id: 10, type: 'earlier' }, null, now, 1, settings)).toEqual({ error: 'stale' });
        expect(earlier(chore, event, undefined, null, now, 1, settings)).toEqual({ error: 'stale' });
    });

    it('refuses an event of another chore', () => {
        const event = stored(2);
        expect(earlier(chore, event, event, null, now, 1, settings)).toEqual({ error: 'not_done' });
    });

    it('refuses a done event that cannot shorten the interval', () => {
        const late = stored(1, 1.4);
        expect(earlier(chore, late, late, null, now, 1, settings)).toEqual({ error: 'overdue' });
    });

    it('ignores one-time tasks', () => {
        const event = stored(1);
        expect(earlier(makeChore({ kind: 'one_time' }), event, event, null, now, 1, settings)).toBeNull();
    });
});

describe('postpone', () => {
    it('snoozes until the next slot for no_time and no_energy', () => {
        const chore = makeChore();
        for (const reason of ['no_time', 'no_energy'] as const) {
            const result = postpone(chore, reason, pctx());
            expect(result.update.snoozedUntil).toBe(now + 3_600_000);
            expect(result.update.interval).toBeUndefined();
            expect(result.event).toMatchObject({ type: 'postpone', reason, durationMin: 10, effort: 2 });
        }
    });

    it('lengthens the interval and snoozes until the new due time for not_yet', () => {
        const chore = makeChore({ interval: 10, lastDoneAt: now - 9 * DAY });
        const result = postpone(chore, 'not_yet', pctx({ elapsed: 9 }));
        expect(result.update.interval).toBeCloseTo(10.625);
        expect(result.update.snoozedUntil).toBeCloseTo(now + 1.625 * DAY);
        expect(result.event.intervalAfter).toBeCloseTo(10.625);
    });

    it('moves to the target at once after a not_yet tap', () => {
        const chore = makeChore({ interval: 10, lastDoneAt: now - 9 * DAY });
        expect(postpone(chore, 'not_yet', pctx({ elapsed: 9, lastLearn: 1 })).update.interval).toBeCloseTo(11.25);
    });

    it('snoozes at least one day for not_yet', () => {
        const chore = makeChore({ interval: 2, lastDoneAt: now - 10 * DAY });
        expect(postpone(chore, 'not_yet', pctx({ elapsed: 10 })).update.snoozedUntil).toBe(now + DAY);
    });

    it('doubles the snooze of a one-time task up to 56 days', () => {
        const days = [0, 1, 2, 3, 4].map((count) =>
            (postpone(makeChore({ kind: 'one_time', notYetCount: count }), 'not_yet', pctx()).update.snoozedUntil! - now) / DAY);
        expect(days).toEqual([7, 14, 28, 56, 56]);
        expect(postpone(makeChore({ kind: 'one_time' }), 'not_yet', pctx()).update.notYetCount).toBe(1);
    });
});

describe('learnDirection', () => {
    it('is -1 for earlier, 1 for not_yet and null otherwise', () => {
        expect(learnDirection({ type: 'earlier', reason: null })).toBe(-1);
        expect(learnDirection({ type: 'postpone', reason: 'not_yet' })).toBe(1);
        expect(learnDirection({ type: 'postpone', reason: 'no_time' })).toBeNull();
        expect(learnDirection({ type: 'done', reason: null })).toBeNull();
    });
});
