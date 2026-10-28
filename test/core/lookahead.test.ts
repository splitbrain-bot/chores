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
        reason: { code: 'trigger' } };
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
        expect(isLookaheadCandidate(evaluated({}), false)).toBe(false);
        expect(isLookaheadCandidate(evaluated({ requiresId: 1 }), true)).toBe(true);
        expect(isLookaheadCandidate(evaluated({ noisy: true }), false)).toBe(true);
        expect(isLookaheadCandidate(evaluated({ personIds: [1, 2] }), false)).toBe(true);
        expect(isLookaheadCandidate(evaluated({ noisy: true, deletedAt: 1 }), false)).toBe(false);
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
        // Saturday is full in the calendar, Sunday is quiet, Monday fits
        const busy = { start: at('2026-10-31T00:00+01:00'), end: at('2026-11-01T00:00+01:00'), summary: 'x', allDay: false };
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
        // person 2 is busy on Friday, Saturday fits for both
        const busy = { start: at('2026-10-30T00:00+01:00'), end: at('2026-10-31T00:00+01:00'), summary: 'x', allDay: false };
        const chore = evaluated({ durationMin: 30, personIds: [1, 2] });
        const hints = lookahead([chore], ctx({ calendars: new Map([[2, [busy]]]) }));
        expect(hints[0]!.date).toBe('2026-10-31');
        expect(hints[0]!.reasons).toContainEqual({ code: 'all_free' });
        expect(lookahead([evaluated({ durationMin: 30, personIds: [1] })], ctx())).toEqual([]);
    });

    it('ignores chores without a reason for a hint and chores with a low need', () => {
        expect(lookahead([evaluated({})], ctx())).toEqual([]);
        expect(lookahead([evaluated({ noisy: true, interval: 100 }, 0.1)], ctx())).toEqual([]);
    });
});
