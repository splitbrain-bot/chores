import { describe, expect, it } from 'vitest';
import { buildOccupancy, clockAt, presenceBetween } from '../../src/core/clock.ts';
import { DAY, HOUR, MINUTE, type StateRecord } from '../../src/core/types.ts';
import { at } from './fixtures.ts';

const A = 'person.a';
const K = 'person.k';

/**
 * Creates a state record.
 */
function rec(entityId: string, state: string, iso: string): StateRecord {
    return { entityId, state, at: at(iso) };
}

describe('clockAt', () => {
    const t0 = at('2026-10-26T00:00+01:00');
    const rows = [
        { startAt: t0, endAt: t0 + 2 * HOUR, clockStart: 0 },
        { startAt: t0 + 5 * HOUR, endAt: null, clockStart: 2 * HOUR },
    ];

    it('runs inside a row', () => {
        expect(clockAt(t0 + HOUR, rows, t0)).toBe(HOUR);
        expect(clockAt(t0 + 6 * HOUR, rows, t0)).toBe(3 * HOUR);
    });

    it('stops after a closed row', () => {
        expect(clockAt(t0 + 4 * HOUR, rows, t0)).toBe(2 * HOUR);
    });

    it('assumes presence before the first record', () => {
        expect(clockAt(t0 - DAY, rows, t0)).toBe(-DAY);
        expect(presenceBetween(t0 - DAY, t0 + 4 * HOUR, rows, t0)).toBe(DAY + 2 * HOUR);
    });

    it('is the wall clock without records', () => {
        expect(presenceBetween(1000, 5000, [], null)).toBe(4000);
    });
});

describe('buildOccupancy', () => {
    it('keeps the clock running while one person is at home', () => {
        const rows = buildOccupancy([
            rec(A, 'home', '2026-10-26T00:00+01:00'),
            rec(K, 'home', '2026-10-26T00:00+01:00'),
            rec(A, 'not_home', '2026-10-26T07:23+01:00'),
            rec(A, 'home', '2026-10-26T08:17+01:00'),
            rec(K, 'not_home', '2026-10-26T16:12+01:00'),
            rec(K, 'home', '2026-10-26T16:36+01:00'),
            rec(A, 'not_home', '2026-10-26T16:51+01:00'),
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.endAt).toBeNull();
    });

    it('stops the clock during a 21-day vacation', () => {
        const records = [
            rec(A, 'home', '2026-08-01T08:00+02:00'),
            rec(K, 'home', '2026-08-01T08:00+02:00'),
            rec(A, 'not_home', '2026-08-01T09:00+02:00'),
            rec(K, 'not_home', '2026-08-01T09:00+02:00'),
            rec(K, 'unavailable', '2026-08-10T09:00+02:00'),
            rec(A, 'home', '2026-08-22T18:00+02:00'),
        ];
        const rows = buildOccupancy(records);
        expect(rows).toHaveLength(2);
        expect(rows[0]!.endAt).toBe(at('2026-08-01T09:00+02:00'));
        expect(rows[1]!.clockStart).toBe(HOUR);
        const first = records[0]!.at;
        const vacation = presenceBetween(at('2026-08-01T09:00+02:00'), at('2026-08-22T18:00+02:00'), rows, first);
        expect(vacation).toBe(0);
        expect(presenceBetween(at('2026-08-01T08:30+02:00'), at('2026-08-22T18:30+02:00'), rows, first))
            .toBe(60 * MINUTE);
    });

    it('ignores unavailable states', () => {
        const rows = buildOccupancy([
            rec(A, 'home', '2026-10-26T00:00+01:00'),
            rec(A, 'unavailable', '2026-10-26T01:00+01:00'),
            rec(A, 'unknown', '2026-10-26T02:00+01:00'),
        ]);
        expect(rows).toEqual([{ startAt: at('2026-10-26T00:00+01:00'), endAt: null, clockStart: 0 }]);
    });
});
