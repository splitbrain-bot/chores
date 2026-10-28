import { describe, expect, it } from 'vitest';
import { computeNeed, triggerApplies, type NeedContext } from '../../src/core/need.ts';
import { DAY, HOUR } from '../../src/core/types.ts';
import { at, makeChore, settings } from './fixtures.ts';

const now = at('2026-10-26T12:00+01:00');

/**
 * Creates a need context without occupancy records.
 */
function ctx(over: Partial<NeedContext> = {}): NeedContext {
    return { now, settings, occupancy: [], firstRecordAt: null, ...over };
}

describe('raw need', () => {
    it('is the elapsed time divided by the interval', () => {
        const chore = makeChore({ interval: 10, lastDoneAt: now - 5 * DAY });
        expect(computeNeed(chore, ctx()).need).toBeCloseTo(0.5);
    });

    it('grows with the same slope after the interval', () => {
        const chore = makeChore({ interval: 10, lastDoneAt: now - 25 * DAY });
        const result = computeNeed(chore, ctx());
        expect(result.need).toBeCloseTo(2.5);
        expect(result.reason).toMatchObject({ code: 'interval', interval: 10 });
    });

    it('counts only the presence time for chores that pause when nobody is at home', () => {
        const chore = makeChore({ pausesWhenAway: true, interval: 10, lastDoneAt: now - 10 * DAY });
        const occupancy = [
            { startAt: now - 10 * DAY, endAt: now - 5 * DAY, clockStart: 0 },
        ];
        const result = computeNeed(chore, ctx({ occupancy, firstRecordAt: now - 10 * DAY }));
        expect(result.elapsed).toBeCloseTo(5);
        expect(result.need).toBeCloseTo(0.5);
    });
});

describe('season', () => {
    it('counts the time outside the season up to one interval', () => {
        // last mowed on 20 October, the season is April to October: 12 days in season plus 14 of the 151 days outside
        const chore = makeChore({ interval: 14, seasonMonths: [4, 5, 6, 7, 8, 9, 10], lastDoneAt: at('2026-10-20T10:00+02:00') });
        const result = computeNeed(chore, ctx({ now: at('2027-04-01T12:00+02:00') }));
        expect(result.elapsed).toBeCloseTo(26, 0);
        expect(result.need).toBeCloseTo(1.9, 0);
    });

    it('counts the whole time of a yearly chore with a short season', () => {
        // dethatched on 15 March, the season is March to May, due again in the middle of March
        const chore = makeChore({ interval: 365, seasonMonths: [3, 4, 5], lastDoneAt: at('2026-03-15T10:00+01:00') });
        const march = computeNeed(chore, ctx({ now: at('2027-03-01T12:00+01:00') }));
        expect(march.elapsed).toBeCloseTo(351, 0);
        expect(march.need).toBeCloseTo(0.96, 1);
        // in the second year the time outside the season is limited, the time in season adds up
        const later = computeNeed(chore, ctx({ now: at('2028-05-15T12:00+02:00') }));
        expect(later.elapsed).toBeCloseTo(245 + 365, -1);
        expect(later.need).toBeGreaterThan(1.5);
    });

    it('counts only the presence for chores that pause when nobody is at home', () => {
        const chore = makeChore({ pausesWhenAway: true, interval: 10, seasonMonths: [11, 12, 1, 2, 3],
            lastDoneAt: at('2026-03-30T00:00+02:00') });
        const result = computeNeed(chore, ctx({ now: at('2026-11-03T00:00+01:00') }));
        // 4 days in season, the time outside is limited to the interval
        expect(result.elapsed).toBeCloseTo(14, 1);
    });
});

describe('deadline', () => {
    const deadline = at('2026-11-16T00:00+01:00');
    const base = { interval: 365, lastDoneAt: at('2026-01-01T10:00+01:00'), deadlineMd: '11-15' };

    it('starts at 10 at the start of the lead period', () => {
        const result = computeNeed(makeChore(base), ctx({ now: deadline - 14 * DAY }));
        expect(result.need).toBeCloseTo(10);
        expect(result.urgent).toBe(true);
    });

    it('is 10.5 in the middle', () => {
        expect(computeNeed(makeChore(base), ctx({ now: deadline - 7 * DAY })).need).toBeCloseTo(10.5);
    });

    it('uses the lead days of the settings', () => {
        const short = { ...settings, deadline_lead_days: 4 };
        expect(computeNeed(makeChore(base), ctx({ now: deadline - 7 * DAY, settings: short })).urgent).toBe(false);
        expect(computeNeed(makeChore(base), ctx({ now: deadline - 2 * DAY, settings: short })).need).toBeCloseTo(10.5);
    });

    it('grows by one per day after the deadline', () => {
        const result = computeNeed(makeChore(base), ctx({ now: deadline + 3 * DAY }));
        expect(result.need).toBeCloseTo(14);
        expect(result.reason).toMatchObject({ code: 'deadline', overdueDays: 3 });
    });

    it('does not apply before the lead period', () => {
        expect(computeNeed(makeChore(base), ctx({ now: deadline - 20 * DAY })).urgent).toBe(false);
    });

    it('is gone after a done event in the lead period', () => {
        const chore = makeChore({ ...base, lastDoneAt: deadline - 5 * DAY });
        const result = computeNeed(chore, ctx({ now: deadline + 3 * DAY }));
        expect(result.urgent).toBe(false);
        expect(result.need).toBeLessThan(1);
    });

    it('applies to a chore that was created in the lead period', () => {
        const created = deadline - 5 * DAY;
        const chore = makeChore({ ...base, createdAt: created, lastDoneAt: created });
        expect(computeNeed(chore, ctx({ now: deadline - 3 * DAY })).urgent).toBe(true);
        const imported = makeChore({ ...base, createdAt: created, lastDoneAt: created - 2 * DAY });
        expect(computeNeed(imported, ctx({ now: deadline - 3 * DAY })).urgent).toBe(true);
    });

    it('applies to a fixed deadline of a one-time task', () => {
        const chore = makeChore({ kind: 'one_time', interval: null, deadlineAt: deadline, createdAt: deadline - 10 * DAY,
            lastDoneAt: deadline - 10 * DAY });
        expect(computeNeed(chore, ctx({ now: deadline - 7 * DAY })).need).toBeCloseTo(10.5);
    });
});

describe('one-time task', () => {
    it('reaches 1 after the reference days and stays there', () => {
        const young = makeChore({ kind: 'one_time', interval: null, createdAt: now - 15 * DAY });
        expect(computeNeed(young, ctx()).need).toBeCloseTo(0.5);
        const old = makeChore({ kind: 'one_time', interval: null, createdAt: now - 60 * DAY });
        const result = computeNeed(old, ctx());
        expect(result.need).toBe(1);
        expect(result.reason).toMatchObject({ code: 'one_time', ageDays: 60 });
    });
});

describe('trigger', () => {
    const chore = makeChore({ triggerId: 1, interval: 7, lastDoneAt: now - 5 * DAY, triggerResult: 1,
        triggerSinceAt: now - DAY });

    it('raises the need to 10 when the condition became true after the last done event', () => {
        const result = computeNeed(chore, ctx());
        expect(result).toMatchObject({ need: 10, urgent: true, reason: { code: 'trigger' } });
    });

    it('does not apply after a done event since the condition became true', () => {
        expect(triggerApplies({ ...chore, triggerSinceAt: now - 6 * DAY }, 5 / 7, settings)).toBe(false);
        expect(computeNeed({ ...chore, triggerSinceAt: now - 6 * DAY }, ctx()).urgent).toBe(false);
    });

    it('does not apply before half of the interval', () => {
        const fresh = { ...chore, lastDoneAt: now - DAY, triggerSinceAt: now - HOUR };
        expect(computeNeed(fresh, ctx()).urgent).toBe(false);
        expect(computeNeed(fresh, ctx({ settings: { ...settings, trigger_min_need: 0.1 } })).need).toBe(10);
    });

    it('does nothing with result 0, null or without a time since true', () => {
        expect(computeNeed({ ...chore, triggerResult: 0 }, ctx()).urgent).toBe(false);
        expect(computeNeed({ ...chore, triggerResult: null }, ctx()).need).toBeLessThan(1);
        expect(triggerApplies({ ...chore, triggerSinceAt: null }, 1, settings)).toBe(false);
        expect(triggerApplies({ ...chore, triggerId: null }, 1, settings)).toBe(false);
    });
});
