import { describe, expect, it } from 'vitest';
import { done, earlier, postpone, type PostponeContext } from '../../src/core/feedback.ts';
import { DAY, type ChoreEvent } from '../../src/core/types.ts';
import { at, makeChore } from './fixtures.ts';

const now = at('2026-10-26T18:00+01:00');

/**
 * Creates a stored done event.
 */
function stored(choreId: number, eventAt: number): ChoreEvent {
    return { id: 9, choreId, type: 'done', reason: null, at: eventAt, personId: 1, needLevel: 1.2, intervalBefore: 7,
        intervalAfter: 7, effort: 2 };
}

/**
 * Creates a postpone context.
 */
function pctx(over: Partial<PostponeContext> = {}): PostponeContext {
    return { now, need: 1, elapsed: 7, nextSlotAt: now + 3_600_000, oneTimeSnoozeDays: 7, personId: 1, ...over };
}

describe('done', () => {
    it('resets the chore and records the event', () => {
        const chore = makeChore({ snoozedUntil: now + DAY });
        const result = done(chore, now, 1.2, 1);
        expect(result.update).toMatchObject({ lastDoneAt: now, snoozedUntil: null });
        expect(result.update.deletedAt).toBeUndefined();
        expect(result.event).toMatchObject({ type: 'done', needLevel: 1.2, personId: 1, effort: 2 });
    });

    it('deletes a one-time task', () => {
        expect(done(makeChore({ kind: 'one_time' }), now, 1, null).update.deletedAt).toBe(now);
    });
});

describe('earlier', () => {
    const chore = makeChore({ interval: 10 });

    it('shortens the interval within the window', () => {
        const result = earlier(chore, stored(1, now - 30_000), false, now, 1);
        expect(result).toMatchObject({ update: { interval: 8.5 }, event: { type: 'earlier', intervalBefore: 10,
            intervalAfter: 8.5 } });
    });

    it('refuses a call after the window', () => {
        expect(earlier(chore, stored(1, now - 61_000), false, now, 1)).toEqual({ error: 'window' });
    });

    it('refuses a second call', () => {
        expect(earlier(chore, stored(1, now - 1000), true, now, 1)).toEqual({ error: 'already' });
    });

    it('refuses an event of another chore', () => {
        expect(earlier(chore, stored(2, now - 1000), false, now, 1)).toEqual({ error: 'not_done' });
    });

    it('ignores one-time tasks', () => {
        expect(earlier(makeChore({ kind: 'one_time' }), stored(1, now - 1000), false, now, 1)).toBeNull();
    });
});

describe('postpone', () => {
    it('snoozes until the next slot for no_time and no_energy', () => {
        const chore = makeChore();
        for (const reason of ['no_time', 'no_energy'] as const) {
            const result = postpone(chore, reason, pctx());
            expect(result.update.snoozedUntil).toBe(now + 3_600_000);
            expect(result.update.interval).toBeUndefined();
            expect(result.event).toMatchObject({ type: 'postpone', reason });
        }
    });

    it('lengthens the interval and snoozes until the new due time for not_yet', () => {
        const chore = makeChore({ interval: 10, lastDoneAt: now - 9 * DAY });
        const result = postpone(chore, 'not_yet', pctx());
        expect(result.update.interval).toBeCloseTo(11.5);
        expect(result.update.snoozedUntil).toBeCloseTo(now + 2.5 * DAY);
        expect(result.event.intervalAfter).toBeCloseTo(11.5);
    });

    it('snoozes at least one day for not_yet', () => {
        const chore = makeChore({ interval: 2, lastDoneAt: now - 10 * DAY });
        expect(postpone(chore, 'not_yet', pctx()).update.snoozedUntil).toBe(now + DAY);
    });

    it('doubles the snooze of a one-time task up to 56 days', () => {
        const days = [0, 1, 2, 3, 4].map((count) =>
            (postpone(makeChore({ kind: 'one_time', notYetCount: count }), 'not_yet', pctx()).update.snoozedUntil! - now) / DAY);
        expect(days).toEqual([7, 14, 28, 56, 56]);
        expect(postpone(makeChore({ kind: 'one_time' }), 'not_yet', pctx()).update.notYetCount).toBe(1);
    });
});
