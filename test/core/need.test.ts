import { describe, expect, it } from 'vitest';
import { computeNeed, countCycles, type NeedContext } from '../../src/core/need.ts';
import { DAY, type Importance } from '../../src/core/types.ts';
import { at, makeChore, settings } from './fixtures.ts';

const now = at('2026-10-26T12:00+01:00');

/**
 * Creates a need context without occupancy records.
 */
function ctx(over: Partial<NeedContext> = {}): NeedContext {
    return { now, settings, occupancy: [], firstRecordAt: null, cycles: new Map(), ...over };
}

describe('raw need', () => {
    it('is linear up to the interval', () => {
        const chore = makeChore({ interval: 10, lastDoneAt: now - 5 * DAY });
        expect(computeNeed(chore, ctx()).need).toBeCloseTo(0.5);
    });

    it.each([
        ['optional', 1.3],
        ['normal', 2],
        ['important', 3],
        ['critical', 5],
    ] as [Importance, number][])('grows with the slope of %s after the interval', (importance, expected) => {
        const chore = makeChore({ interval: 10, lastDoneAt: now - 20 * DAY, importance });
        expect(computeNeed(chore, ctx()).need).toBeCloseTo(expected);
    });

    it('counts only the presence time for usage chores', () => {
        const chore = makeChore({ growth: 'usage', interval: 10, lastDoneAt: now - 10 * DAY });
        const occupancy = [
            { startAt: now - 10 * DAY, endAt: now - 5 * DAY, clockStart: 0 },
        ];
        const result = computeNeed(chore, ctx({ occupancy, firstRecordAt: now - 10 * DAY }));
        expect(result.elapsed).toBeCloseTo(5);
        expect(result.need).toBeCloseTo(0.5);
    });
});

describe('season', () => {
    it('counts only the time inside the season', () => {
        // last mowed on 20 October, the season is April to October
        const chore = makeChore({ interval: 7, seasonMonths: [4, 5, 6, 7, 8, 9, 10], lastDoneAt: Date.parse('2026-10-20T10:00+02:00') });
        const april = Date.parse('2027-04-03T10:00+02:00');
        const result = computeNeed(chore, ctx({ now: april }));
        expect(result.elapsed).toBeCloseTo(11.6 + 2.4, 0);
        expect(result.need).toBeCloseTo(2, 0);
    });

    it('counts only the presence inside the season for usage chores', () => {
        const chore = makeChore({ growth: 'usage', interval: 10, seasonMonths: [11, 12, 1, 2, 3],
            lastDoneAt: Date.parse('2026-03-30T00:00+02:00') });
        const result = computeNeed(chore, ctx({ now: Date.parse('2026-11-03T00:00+01:00') }));
        expect(result.elapsed).toBeCloseTo(4, 1);
    });
});

describe('counter growth', () => {
    it('counts on to off and ignores unavailable', () => {
        expect(countCycles(['on', 'unavailable', 'on', 'off', 'unavailable', 'off', 'on', 'off'])).toBe(2);
        expect(countCycles(['off'], 'on')).toBe(1);
        expect(countCycles(['unavailable', 'off'], 'on')).toBe(1);
    });

    it('uses the cycles as the elapsed value', () => {
        const chore = makeChore({ growth: 'counter', interval: 10, counterEntity: 'binary_sensor.x' });
        const result = computeNeed(chore, ctx({ cycles: new Map([[1, 5]]) }));
        expect(result).toMatchObject({ elapsed: 5, unit: 'cycles' });
        expect(result.need).toBeCloseTo(0.5);
    });
});

describe('deadline', () => {
    const deadline = at('2026-11-16T00:00+01:00');
    const base = { interval: 365, lastDoneAt: at('2026-01-01T10:00+01:00'), deadlineMd: '11-15', deadlineLeadDays: 14 };

    it('starts at 10 at the start of the lead period', () => {
        const result = computeNeed(makeChore(base), ctx({ now: deadline - 14 * DAY }));
        expect(result.need).toBeCloseTo(10);
        expect(result.urgent).toBe(true);
    });

    it('is 10.5 in the middle', () => {
        expect(computeNeed(makeChore(base), ctx({ now: deadline - 7 * DAY })).need).toBeCloseTo(10.5);
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
    it('reaches 1 after 30 days and grows with the importance', () => {
        const chore = makeChore({ kind: 'one_time', interval: null, createdAt: now - 30 * DAY });
        expect(computeNeed(chore, ctx()).need).toBeCloseTo(1);
        const older = makeChore({ kind: 'one_time', interval: null, createdAt: now - 60 * DAY, importance: 'optional' });
        expect(computeNeed(older, ctx()).need).toBeCloseTo(1.3);
    });
});

describe('boost', () => {
    const chore = makeChore({ boostId: 1, lastDoneAt: now - DAY });

    it('raises the need to 10 with result 1', () => {
        const result = computeNeed({ ...chore, boostResult: 1 }, ctx());
        expect(result).toMatchObject({ need: 10, urgent: true, reason: { code: 'boost' } });
    });

    it('does nothing with result 0 or null', () => {
        expect(computeNeed({ ...chore, boostResult: 0 }, ctx()).urgent).toBe(false);
        expect(computeNeed({ ...chore, boostResult: null }, ctx()).need).toBeLessThan(1);
    });
});
