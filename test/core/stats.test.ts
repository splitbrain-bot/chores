import { describe, expect, it } from 'vitest';
import { weeklyStats, weekStart } from '../../src/core/stats.ts';
import { at } from './fixtures.ts';

const tz = 'Europe/Berlin';

describe('weekStart', () => {
    it('returns the local Monday of the week', () => {
        expect(weekStart(at('2026-11-04T12:00+01:00'), tz)).toBe('2026-11-02');
        expect(weekStart(at('2026-11-02T00:00+01:00'), tz)).toBe('2026-11-02');
        expect(weekStart(at('2026-11-08T23:30+01:00'), tz)).toBe('2026-11-02');
        // Monday after midnight is the new week, also when it is still Sunday in UTC
        expect(weekStart(at('2026-11-01T23:30Z'), tz)).toBe('2026-11-02');
    });
});

describe('weeklyStats', () => {
    it('counts the done chores and their effort per calendar week', () => {
        // Wednesday
        const now = at('2026-11-04T12:00+01:00');
        const events = [
            { at: at('2026-11-02T08:00+01:00'), effort: 2 },
            { at: at('2026-11-03T08:00+01:00'), effort: 3 },
            { at: at('2026-11-01T22:00+01:00'), effort: 4 },
            // after the change to the winter time
            { at: at('2026-10-26T00:30+01:00'), effort: 1 },
            // before the first week
            { at: at('2026-10-25T23:00+01:00'), effort: 5 },
        ];
        expect(weeklyStats(events, now, tz, 2)).toEqual([
            { start: '2026-10-26', tasks: 2, effort: 5 },
            { start: '2026-11-02', tasks: 2, effort: 5 },
        ]);
    });

    it('gives empty weeks without events', () => {
        const weeks = weeklyStats([], at('2026-11-04T12:00+01:00'), tz, 52);
        expect(weeks).toHaveLength(52);
        expect(weeks[0]).toEqual({ start: '2025-11-10', tasks: 0, effort: 0 });
        expect(weeks.every((w) => w.tasks === 0 && w.effort === 0)).toBe(true);
    });
});
