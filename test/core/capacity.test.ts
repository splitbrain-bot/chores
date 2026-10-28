import { describe, expect, it } from 'vitest';
import { capacityCaps, capacityFor } from '../../src/core/capacity.ts';
import { doers, fitsCapacity } from '../../src/core/possible.ts';
import type { CalendarEvent, ChoreEvent, PostponeReason } from '../../src/core/types.ts';
import { at, makeChore, presence, settings } from './fixtures.ts';

const none = new Set<string>();

/**
 * Creates a timed calendar event.
 */
function event(from: string, to: string, allDay = false): CalendarEvent {
    return { start: at(from), end: at(to), summary: 'x', allDay };
}

/**
 * Creates a done event.
 */
function doneEvent(iso: string, effort: number, personId: number | null): ChoreEvent {
    return { id: 1, choreId: 1, type: 'done', reason: null, at: at(iso), personId, needLevel: 1, intervalBefore: 7,
        intervalAfter: 7, durationMin: 10, effort, startKnown: true };
}

/**
 * Creates a postpone event.
 */
function postponeEvent(iso: string, reason: PostponeReason, durationMin: number, effort: number,
    personId: number | null): ChoreEvent {
    return { id: 2, choreId: 1, type: 'postpone', reason, at: at(iso), personId, needLevel: 1, intervalBefore: 7,
        intervalAfter: 7, durationMin, effort, startKnown: true };
}

describe('capacityCaps', () => {
    const slotStart = at('2026-10-31T18:00+01:00');

    it('has no limits without taps', () => {
        expect(capacityCaps(1, slotStart, [doneEvent('2026-10-31T18:30+01:00', 3, 1)])).toEqual({ minutes: Infinity, energy: Infinity });
    });

    it('limits the minutes below the duration for no_time and the energy below the effort for no_energy', () => {
        const events = [
            postponeEvent('2026-10-31T18:30+01:00', 'no_time', 20, 2, 1),
            postponeEvent('2026-10-31T18:40+01:00', 'no_energy', 10, 3, 1),
        ];
        expect(capacityCaps(1, slotStart, events)).toEqual({ minutes: 19, energy: 2 });
    });

    it('keeps the lowest limit of several taps', () => {
        const events = [
            postponeEvent('2026-10-31T18:30+01:00', 'no_time', 30, 2, 1),
            postponeEvent('2026-10-31T18:40+01:00', 'no_time', 15, 2, 1),
        ];
        expect(capacityCaps(1, slotStart, events).minutes).toBe(14);
    });

    it('applies taps without a person to every person and taps of another person to nobody else', () => {
        const shared = [postponeEvent('2026-10-31T18:30+01:00', 'no_energy', 10, 3, null)];
        expect(capacityCaps(1, slotStart, shared).energy).toBe(2);
        expect(capacityCaps(2, slotStart, shared).energy).toBe(2);
        const other = [postponeEvent('2026-10-31T18:30+01:00', 'no_energy', 10, 3, 2)];
        expect(capacityCaps(1, slotStart, other).energy).toBe(Infinity);
    });

    it('ignores taps before the slot start', () => {
        const before = [postponeEvent('2026-10-31T17:00+01:00', 'no_time', 20, 2, 1)];
        expect(capacityCaps(1, slotStart, before).minutes).toBe(Infinity);
    });
});

describe('capacityFor', () => {
    // Saturday evening slot 18:00 to 21:30 with 45 minutes
    const now = at('2026-10-31T19:00+01:00');

    it('is the slot value without calendar events', () => {
        expect(capacityFor(1, now, settings, none, [], []).capacity).toEqual({ minutes: 45, energy: 3 });
    });

    it('is zero outside of the slots', () => {
        const result = capacityFor(1, at('2026-10-31T23:00+01:00'), settings, none, [], []);
        expect(result).toEqual({ capacity: { minutes: 0, energy: 0 }, slot: null });
    });

    it('subtracts an event that fills the slot', () => {
        const night = event('2026-10-31T17:30+01:00', '2026-10-31T22:00+01:00');
        expect(capacityFor(1, now, settings, none, [night], []).capacity.minutes).toBe(0);
    });

    it('subtracts the overlapping part of an event', () => {
        // 75 of 210 minutes busy
        const partly = event('2026-10-31T20:15+01:00', '2026-10-31T23:00+01:00');
        expect(capacityFor(1, now, settings, none, [partly], []).capacity.minutes).toBe(28);
    });

    it('subtracts five percent for a 30-minute meeting in the 9-hour workday slot', () => {
        const meeting = event('2026-10-27T10:00+01:00', '2026-10-27T10:30+01:00');
        const result = capacityFor(1, at('2026-10-27T09:00+01:00'), settings, none, [meeting], []);
        expect(result.capacity.minutes).toBe(Math.floor(10 * 0.95));
    });

    it('ignores all-day events', () => {
        const allDay = event('2026-10-31T00:00+01:00', '2026-11-01T00:00+01:00', true);
        expect(capacityFor(1, now, settings, none, [allDay], []).capacity.minutes).toBe(45);
    });

    it('reduces the energy after a heavy chore of the person on the previous day', () => {
        const heavy = doneEvent('2026-10-30T15:00+01:00', 4, 1);
        expect(capacityFor(1, now, settings, none, [], [heavy]).capacity.energy).toBe(2);
        expect(capacityFor(2, now, settings, none, [], [heavy]).capacity.energy).toBe(3);
    });

    it('reduces the energy of every person after a heavy chore without a person', () => {
        const heavy = doneEvent('2026-10-30T15:00+01:00', 5, null);
        expect(capacityFor(1, now, settings, none, [], [heavy]).capacity.energy).toBe(2);
        expect(capacityFor(2, now, settings, none, [], [heavy]).capacity.energy).toBe(2);
    });

    it('ignores heavy chores of today and light chores', () => {
        const today = doneEvent('2026-10-31T10:00+01:00', 5, 1);
        const light = doneEvent('2026-10-30T10:00+01:00', 3, 1);
        expect(capacityFor(1, now, settings, none, [], [today, light]).capacity.energy).toBe(3);
    });

    it('applies the limits of the postpone taps in the slot', () => {
        const taps = [
            postponeEvent('2026-10-31T18:30+01:00', 'no_time', 20, 2, 1),
            postponeEvent('2026-10-31T18:40+01:00', 'no_energy', 10, 2, 1),
        ];
        expect(capacityFor(1, now, settings, none, [], taps).capacity).toEqual({ minutes: 19, energy: 1 });
        expect(capacityFor(2, now, settings, none, [], taps).capacity).toEqual({ minutes: 45, energy: 3 });
        const before = [postponeEvent('2026-10-31T17:00+01:00', 'no_time', 20, 2, 1)];
        expect(capacityFor(1, now, settings, none, [], before).capacity.minutes).toBe(45);
    });

    it('does not go below zero with a limit', () => {
        const tap = [postponeEvent('2026-10-31T18:30+01:00', 'no_energy', 5, 1, 1)];
        expect(capacityFor(1, now, settings, none, [], tap).capacity.energy).toBe(0);
    });
});

describe('shared device', () => {
    it('fits when one of the persons at home has the capacity', () => {
        const chore = makeChore({ durationMin: 30 });
        const states = presence({ 1: { home: true }, 2: { home: true } });
        const capacities = new Map([[1, { minutes: 0, energy: 3 }], [2, { minutes: 45, energy: 3 }]]);
        const persons = doers(chore, false, { now: 0, settings, viewer: { kind: 'shared' }, personIds: [1, 2],
            presence: states, capacities, holidays: none });
        expect(persons).toEqual([1, 2]);
        expect(fitsCapacity(chore, persons, capacities)).toBe(true);
        expect(fitsCapacity(chore, [1], capacities)).toBe(false);
    });
});
