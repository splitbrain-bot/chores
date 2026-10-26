import { describe, expect, it } from 'vitest';
import { currentSlot, dayTypeOf, inSeason, localParts, nextSlotStart, zonedTime } from '../../src/core/time.ts';
import { at, settings } from './fixtures.ts';

const tz = 'Europe/Berlin';
const none = new Set<string>();

describe('dayTypeOf', () => {
    it('gives the day type of every weekday', () => {
        // 2026-10-26 is a Monday
        const types = ['26', '27', '28', '29', '30', '31', '01'].map((d, i) =>
            dayTypeOf(i < 6 ? `2026-10-${d}` : `2026-11-${d}`, none));
        expect(types).toEqual(['workday', 'workday', 'workday', 'workday', 'weekend', 'weekend', 'weekend']);
    });

    it('treats a public holiday on a Wednesday as a weekend day', () => {
        expect(dayTypeOf('2027-03-03', none)).toBe('workday');
        expect(dayTypeOf('2027-03-03', new Set(['2027-03-03']))).toBe('weekend');
    });
});

describe('inSeason', () => {
    it('wraps a window over the new year', () => {
        expect(inSeason(12, 11, 3)).toBe(true);
        expect(inSeason(4, 11, 3)).toBe(false);
        expect(inSeason(3, 11, 3)).toBe(true);
    });

    it('accepts every month without a window', () => {
        expect(inSeason(7, null, null)).toBe(true);
    });

    it('handles a normal window', () => {
        expect(inSeason(10, 4, 10)).toBe(true);
        expect(inSeason(11, 4, 10)).toBe(false);
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

    it('gives the local fields', () => {
        expect(localParts(at('2026-10-25T23:30+01:00'), tz)).toMatchObject({ date: '2026-10-25', hour: 23, weekday: 0 });
    });
});
