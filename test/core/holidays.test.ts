import { describe, expect, it } from 'vitest';
import { isPublicHoliday, publicHolidays, type HolidayEvent } from '../../src/core/holidays.ts';

const events: HolidayEvent[] = [
    { start: '2026-10-31', summary: 'Reformation Day (regional holiday)',
        description: 'Public holiday in Brandenburg, Mecklenburg-Western Pomerania, Saxony, Saxony-Anhalt, Thuringia' },
    { start: '2026-10-31', summary: 'Halloween',
        description: 'Observance\nTo hide observances, go to Google Calendar Settings > Holidays in Germany' },
    { start: '2026-11-18', summary: 'Repentance Day (Saxony)', description: 'Public holiday in Saxony' },
    { start: '2026-12-24', summary: 'Christmas Eve (half-day)', description: 'Public holiday\nThis is a half-day holiday.' },
    { start: '2026-12-25', summary: 'Christmas Day', description: 'Public holiday' },
    { start: '2027-03-08', summary: 'International Women\'s Day (regional holiday)',
        description: 'Public holiday in Baden-Württemberg, Bavaria, Berlin, Brandenburg' },
    { start: '2027-03-25', summary: 'Maundy Thursday (regional holiday)',
        description: 'Observance in Baden-Württemberg, Bavaria, Berlin\nTo hide observances, go to Google Calendar' },
];

describe('isPublicHoliday', () => {
    it('accepts a regional holiday only in its states', () => {
        expect(isPublicHoliday(events[0]!, 'Berlin')).toBe(false);
        expect(isPublicHoliday(events[0]!, 'Saxony')).toBe(true);
        expect(isPublicHoliday(events[5]!, 'Berlin')).toBe(true);
    });

    it('treats a holiday of one state without the regional mark as regional', () => {
        expect(isPublicHoliday(events[2]!, 'Berlin')).toBe(false);
        expect(isPublicHoliday(events[2]!, 'Saxony')).toBe(true);
    });

    it('rejects observances', () => {
        expect(isPublicHoliday(events[1]!, 'Berlin')).toBe(false);
        expect(isPublicHoliday(events[6]!, 'Berlin')).toBe(false);
    });

    it('accepts a half-day holiday', () => {
        expect(isPublicHoliday(events[3]!, 'Berlin')).toBe(true);
    });
});

describe('publicHolidays', () => {
    it('returns the sorted dates', () => {
        expect(publicHolidays(events, 'Berlin')).toEqual(['2026-12-24', '2026-12-25', '2027-03-08']);
    });
});
