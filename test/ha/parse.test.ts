import { describe, expect, it } from 'vitest';
import { toCalendarEvents } from '../../src/ha/calendar.ts';
import { parseForecast } from '../../src/ha/forecast.ts';
import { parseHistory } from '../../src/ha/history.ts';
import { toFlag } from '../../src/ha/templates.ts';

describe('parseForecast', () => {
    it('reads the forecast list of the entity', () => {
        const response = { 'weather.home': { forecast: [
            { datetime: '2026-10-27T11:00:00+00:00', condition: 'rainy', temperature: 11, templow: 6, precipitation: 2.1,
                precipitation_probability: 80, wind_speed: 12 },
        ] } };
        expect(parseForecast(response, 'weather.home')).toHaveLength(1);
        expect(parseForecast(response, 'weather.other')).toEqual([]);
        expect(parseForecast(undefined, 'weather.home')).toEqual([]);
    });
});

describe('toCalendarEvents', () => {
    it('converts timed and all-day events', () => {
        const events = toCalendarEvents([
            { start: '2026-10-31T17:30:00+01:00', end: '2026-10-31T22:00:00+01:00', summary: 'Games- & Date-Night' },
            { start: '2026-10-31', end: '2026-11-01', summary: 'Urlaub', description: null },
        ], 'Europe/Berlin');
        expect(events).toEqual([
            { start: Date.parse('2026-10-31T16:30:00Z'), end: Date.parse('2026-10-31T21:00:00Z'), summary: 'Games- & Date-Night',
                allDay: false },
            { start: Date.parse('2026-10-30T23:00:00Z'), end: Date.parse('2026-10-31T23:00:00Z'), summary: 'Urlaub', allDay: true },
        ]);
    });
});

describe('parseHistory', () => {
    it('reads the minimal response format', () => {
        const body = [
            [{ entity_id: 'person.a', state: 'home', last_changed: '2026-10-26T08:00:00Z' },
                { state: 'not_home', last_changed: '2026-10-26T10:00:00Z' }],
            [{ entity_id: 'person.k', state: 'home', last_changed: '2026-10-26T09:00:00Z' }],
        ];
        expect(parseHistory(body).map((r) => `${r.entityId}=${r.state}`)).toEqual(['person.a=home', 'person.k=home',
            'person.a=not_home']);
        expect(parseHistory({})).toEqual([]);
    });
});

describe('toFlag', () => {
    it('converts template results', () => {
        expect([true, false, 'True', 'off', 1, 0, null, 'on'].map(toFlag)).toEqual([1, 0, 1, 0, 1, 0, 0, 1]);
    });
});
