import { describe, expect, it } from 'vitest';
import { isLookaheadCandidate, lookahead, type LookaheadContext } from '../../src/core/lookahead.ts';
import type { Chore, ChoreWithNeed } from '../../src/core/types.ts';
import { at, makeChore, settings } from './fixtures.ts';

// Thursday
const now = at('2026-10-29T12:00+01:00');

/**
 * Creates an evaluated chore.
 */
function evaluated(over: Partial<Chore>, need = 1): ChoreWithNeed {
    return { ...makeChore(over), need, elapsed: 7, urgent: false, possible: false, blockedBy: [],
        reason: { code: 'trigger' }, nextDeadline: null };
}

/**
 * Creates a look-ahead context.
 */
function ctx(over: Partial<LookaheadContext> = {}): LookaheadContext {
    return { now, settings, personIds: [1, 2], holidays: new Set(), calendars: new Map(), forecast: new Map(),
        forecastResults: new Map(), ...over };
}

describe('isLookaheadCandidate', () => {
    it('needs a forecast, a noisy chore or more persons', () => {
        expect(isLookaheadCandidate(evaluated({}), false, ctx())).toBe(false);
        expect(isLookaheadCandidate(evaluated({ requiresId: 1 }), true, ctx())).toBe(true);
        expect(isLookaheadCandidate(evaluated({ noisy: true }), false, ctx())).toBe(true);
        expect(isLookaheadCandidate(evaluated({ personIds: [1, 2] }), false, ctx())).toBe(true);
        expect(isLookaheadCandidate(evaluated({ noisy: true, deletedAt: 1 }), false, ctx())).toBe(false);
    });

    it('takes a chore that a deadline makes urgent in the look-ahead days', () => {
        // the lead period starts on November 2
        const chore = { ...evaluated({}, 0.2), blockedBy: ['need' as const], nextDeadline: at('2026-11-16T00:00+01:00') };
        expect(isLookaheadCandidate(chore, false, ctx())).toBe(true);
        expect(isLookaheadCandidate(chore, false, ctx({ settings: { ...settings, lookahead_days: 3 } }))).toBe(false);
        expect(isLookaheadCandidate({ ...chore, possible: true, blockedBy: [] }, false, ctx())).toBe(false);
    });

    it('takes a chore that only the capacity of the current slot blocks', () => {
        const chore = { ...evaluated({ durationMin: 60 }, 1.5), blockedBy: ['capacity' as const] };
        expect(isLookaheadCandidate(chore, false, ctx())).toBe(true);
        expect(isLookaheadCandidate({ ...chore, blockedBy: ['capacity', 'persons'] }, false, ctx())).toBe(false);
        // outside of the slots nothing fits now
        expect(isLookaheadCandidate(chore, false, ctx({ now: at('2026-10-29T22:00+01:00') }))).toBe(false);
    });
});

describe('lookahead', () => {
    it('gives a noisy chore the next day that is not a Sunday or holiday', () => {
        const chore = evaluated({ noisy: true, durationMin: 60 });
        // Friday 2026-10-30 is a holiday in this test, Saturday fits
        const hints = lookahead([chore], ctx({ holidays: new Set(['2026-10-30']) }));
        expect(hints).toHaveLength(1);
        expect(hints[0]!.date).toBe('2026-10-31');
        expect(hints[0]!.reasons).toContainEqual({ code: 'quiet_day' });
    });

    it('skips the Sunday for a noisy chore', () => {
        // the rest of Thursday and Saturday are full in the calendar, Sunday is quiet, Monday fits
        const busy = { start: now, end: at('2026-11-01T00:00+01:00'), summary: 'x', allDay: false };
        const chore = evaluated({ noisy: true, durationMin: 30, personIds: [1] });
        const hints = lookahead([chore], ctx({ holidays: new Set(['2026-10-30']), calendars: new Map([[1, [busy]]]) }));
        expect(hints[0]!.date).toBe('2026-11-02');
    });

    it('gives no hint when the forecast template is false on every day', () => {
        const chore = evaluated({ id: 5, requiresId: 1 });
        const results = new Map([[5, new Map([['2026-10-30', false], ['2026-10-31', false], ['2026-11-01', null]])]]);
        expect(lookahead([chore], ctx({ forecastResults: results }))).toEqual([]);
    });

    it('uses the forecast entry in the reasons', () => {
        const chore = evaluated({ id: 5, requiresId: 1 });
        const results = new Map([[5, new Map([['2026-10-31', true]])]]);
        const forecast = new Map([['2026-10-31', { datetime: '2026-10-31', condition: 'sunny', temperature: 12,
            precipitation: 0 }]]);
        const hints = lookahead([chore], ctx({ forecastResults: results, forecast }));
        expect(hints[0]!.reasons[0]).toEqual({ code: 'weather', condition: 'sunny', temperature: 12, precipitation: 0 });
    });

    it('gives a chore of more persons the next day on which all of them are free', () => {
        // person 2 is busy for the rest of Thursday and on Friday, Saturday fits for both
        const busy = { start: now, end: at('2026-10-31T00:00+01:00'), summary: 'x', allDay: false };
        const chore = evaluated({ durationMin: 30, personIds: [1, 2] });
        const hints = lookahead([chore], ctx({ calendars: new Map([[2, [busy]]]) }));
        expect(hints[0]!.date).toBe('2026-10-31');
        expect(hints[0]!.reasons).toContainEqual({ code: 'all_free' });
        expect(lookahead([evaluated({ durationMin: 30, personIds: [1] })], ctx())).toEqual([]);
    });

    it('uses the rest of today', () => {
        // the slots of Thursday from 12:00 have 10 and 45 minutes
        const hints = lookahead([evaluated({ noisy: true, durationMin: 30 })], ctx());
        expect(hints[0]).toMatchObject({ date: '2026-10-29', reasons: [{ code: 'quiet_day' }, { code: 'free_time', minutes: 55 }] });
        expect(lookahead([evaluated({ noisy: true, durationMin: 60 })], ctx())[0]!.date).toBe('2026-10-30');
    });

    it('needs a slot with enough energy', () => {
        // the slots of Thursday have at most the energy 3, Friday has 5
        expect(lookahead([evaluated({ noisy: true, durationMin: 30, effort: 4 })], ctx())[0]!.date).toBe('2026-10-30');
    });

    it('gives a chore with a deadline the first fitting day of the lead period', () => {
        const chore = { ...evaluated({ durationMin: 30 }, 0.2), blockedBy: ['need' as const],
            nextDeadline: at('2026-11-16T00:00+01:00') };
        const hints = lookahead([chore], ctx());
        expect(hints[0]).toMatchObject({ date: '2026-11-02',
            reasons: [{ code: 'deadline', deadline: at('2026-11-16T00:00+01:00') }, { code: 'free_time', minutes: 65 }] });
    });

    it('gives a chore that does not fit the current slot the first day with enough time', () => {
        const chore = { ...evaluated({ durationMin: 60 }, 1.5), blockedBy: ['capacity' as const] };
        expect(lookahead([chore], ctx())[0]).toMatchObject({ date: '2026-10-30', reasons: [{ code: 'free_time', minutes: 285 }] });
    });

    it('ignores chores without a reason for a hint and chores with a low need', () => {
        expect(lookahead([evaluated({})], ctx())).toEqual([]);
        expect(lookahead([evaluated({ noisy: true, interval: 100 }, 0.1)], ctx())).toEqual([]);
    });
});
