import { describe, expect, it } from 'vitest';
import { currentSlot, inSeason, localParts, nextSlotStart, seasonParts, slotWeekday, zonedTime } from '../../src/core/time.ts';
import { at, settings } from './fixtures.ts';

const tz = 'Europe/Berlin';
const none = new Set<string>();

describe('slotWeekday', () => {
    it('gives the weekday of every day', () => {
        // 2026-10-26 is a Monday
        const days = ['26', '27', '28', '29', '30', '31', '01'].map((d, i) =>
            slotWeekday(i < 6 ? `2026-10-${d}` : `2026-11-${d}`, none));
        expect(days).toEqual([1, 2, 3, 4, 5, 6, 0]);
    });

    it('treats a public holiday on a Wednesday as a Sunday', () => {
        expect(slotWeekday('2027-03-03', none)).toBe(3);
        expect(slotWeekday('2027-03-03', new Set(['2027-03-03']))).toBe(0);
    });
});

describe('inSeason', () => {
    it('accepts only the months of the season', () => {
        expect(inSeason(12, [11, 12, 1])).toBe(true);
        expect(inSeason(4, [3, 5, 9])).toBe(false);
        expect(inSeason(9, [3, 5, 9])).toBe(true);
    });

    it('accepts every month without a season', () => {
        expect(inSeason(7, [])).toBe(true);
    });
});

describe('seasonParts', () => {
    it('returns the whole period without a window', () => {
        expect(seasonParts(1, 5, tz, [])).toEqual([[1, 5]]);
    });

    it('cuts the period to the season months', () => {
        const parts = seasonParts(at('2026-10-20T10:00+02:00'), at('2027-04-11T10:00+02:00'), tz, [4, 5, 6, 7, 8, 9, 10]);
        expect(parts).toEqual([
            [at('2026-10-20T10:00+02:00'), at('2026-11-01T00:00+01:00')],
            [at('2027-04-01T00:00+02:00'), at('2027-04-11T10:00+02:00')],
        ]);
    });

    it('handles a season over the new year', () => {
        const parts = seasonParts(at('2026-10-15T00:00+02:00'), at('2027-04-15T00:00+02:00'), tz, [11, 12, 1, 2, 3]);
        expect(parts).toEqual([[at('2026-11-01T00:00+01:00'), at('2027-04-01T00:00+02:00')]]);
    });

    it('handles a season with gaps', () => {
        const parts = seasonParts(at('2026-03-15T00:00+01:00'), at('2026-10-15T00:00+02:00'), tz, [3, 4, 9]);
        expect(parts).toEqual([
            [at('2026-03-15T00:00+01:00'), at('2026-05-01T00:00+02:00')],
            [at('2026-09-01T00:00+02:00'), at('2026-10-01T00:00+02:00')],
        ]);
    });
});

describe('slots', () => {
    it('includes the start and excludes the end of a slot', () => {
        const slot = currentSlot(at('2026-10-27T17:00+01:00'), tz, settings.capacity_slots, none);
        expect(slot?.slot.from).toBe('17:00');
        const before = currentSlot(at('2026-10-27T16:59+01:00'), tz, settings.capacity_slots, none);
        expect(before?.slot.from).toBe('08:00');
        expect(currentSlot(at('2026-10-27T21:30+01:00'), tz, settings.capacity_slots, none)).toBeNull();
    });

    it('finds the next slot on the next day', () => {
        // Thursday evening, the next slot is Friday 08:00, a weekend slot
        expect(nextSlotStart(at('2026-10-29T22:00+01:00'), tz, settings.capacity_slots, none))
            .toBe(at('2026-10-30T08:00+01:00'));
    });

    it('places the slots correctly on the daylight saving days', () => {
        // 2026-03-29 is a Sunday, the clock jumps from 02:00 to 03:00
        expect(zonedTime('2026-03-29', '08:00', tz)).toBe(at('2026-03-29T08:00+02:00'));
        expect(zonedTime('2026-03-28', '08:00', tz)).toBe(at('2026-03-28T08:00+01:00'));
        // 2026-10-25 is a Sunday, the clock goes back from 03:00 to 02:00
        expect(zonedTime('2026-10-25', '12:00', tz)).toBe(at('2026-10-25T12:00+01:00'));
        expect(zonedTime('2026-10-24', '12:00', tz)).toBe(at('2026-10-24T12:00+02:00'));
        const slot = currentSlot(at('2026-10-25T11:59+01:00'), tz, settings.capacity_slots, none);
        expect(slot?.end).toBe(at('2026-10-25T12:00+01:00'));
        expect(slot!.end - slot!.start).toBe(4 * 3_600_000);
    });

    it('uses a slot only on its weekdays', () => {
        const slots = [{ days: [3], from: '10:00', to: '12:00', minutes: 30, energy: 3 }];
        // 2026-10-28 is a Wednesday
        expect(currentSlot(at('2026-10-28T11:00+01:00'), tz, slots, none)?.slot.from).toBe('10:00');
        expect(currentSlot(at('2026-10-29T11:00+01:00'), tz, slots, none)).toBeNull();
        expect(nextSlotStart(at('2026-10-28T13:00+01:00'), tz, slots, none)).toBe(at('2026-11-04T10:00+01:00'));
    });

    it('gives the local fields', () => {
        expect(localParts(at('2026-10-25T23:30+01:00'), tz)).toMatchObject({ date: '2026-10-25', hour: 23, weekday: 0 });
    });
});
