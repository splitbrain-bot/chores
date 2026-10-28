import { addDays, currentSlot, localDate, slotLengthMinutes, type PlacedSlot } from './time.ts';
import { MINUTE, type CalendarEvent, type Capacity, type ChoreEvent, type Settings } from './types.ts';

/** Capacity of a person with the slot it comes from. */
export interface CapacityResult {
    capacity: Capacity;
    slot: PlacedSlot | null;
}

/**
 * Returns the minutes of a period that the timed calendar events cover. Overlapping events count once.
 *
 * @param events calendar events
 * @param start start of the period
 * @param end end of the period
 */
export function busyMinutes(events: readonly CalendarEvent[], start: number, end: number): number {
    const parts = events
        .filter((e) => !e.allDay && e.end > start && e.start < end)
        .map((e) => [Math.max(e.start, start), Math.min(e.end, end)] as const)
        .sort((a, b) => a[0] - b[0]);

    let total = 0;
    let covered = start;
    for (const [s, e] of parts) {
        const from = Math.max(s, covered);
        if (e > from) {
            total += e - from;
            covered = e;
        }
    }
    return total / MINUTE;
}

/**
 * Returns the free minutes of a slot after the busy calendar time.
 *
 * @param placed the slot with timestamps
 * @param events calendar events of the person
 */
export function freeMinutes(placed: PlacedSlot, events: readonly CalendarEvent[]): number {
    const length = slotLengthMinutes(placed);
    if (length <= 0) return 0;
    const busy = busyMinutes(events, placed.start, placed.end);
    return Math.floor(placed.slot.minutes * Math.max(0, 1 - busy / length));
}

/**
 * Tells if a person did a heavy chore on the previous local day. Events without a person count for every person.
 *
 * @param personId the person
 * @param now milliseconds since the epoch
 * @param events recent done events
 * @param settings the settings
 */
export function hasHangover(personId: number, now: number, events: readonly ChoreEvent[], settings: Settings): boolean {
    const tz = settings.time_zone;
    const yesterday = addDays(localDate(now, tz), -1);
    return events.some((e) => e.type === 'done'
        && e.effort >= settings.hangover_effort
        && (e.personId === null || e.personId === personId)
        && localDate(e.at, tz) === yesterday);
}

/**
 * Returns the capacity limits from the postpone taps of a person in the current slot. "No time" says that the
 * person has less time than the chore needs, "no energy" that the person has less energy than the chore needs.
 * Events without a person count for every person.
 *
 * @param personId the person
 * @param slotStart start of the current slot
 * @param events recent events
 * @returns the limits, Infinity without a tap
 */
export function capacityCaps(personId: number, slotStart: number, events: readonly ChoreEvent[]): Capacity {
    const caps: Capacity = { minutes: Infinity, energy: Infinity };
    for (const e of events) {
        if (e.type !== 'postpone' || e.at < slotStart || (e.personId !== null && e.personId !== personId)) continue;
        if (e.reason === 'no_time') caps.minutes = Math.min(caps.minutes, e.durationMin - 1);
        if (e.reason === 'no_energy') caps.energy = Math.min(caps.energy, e.effort - 1);
    }
    return caps;
}

/**
 * Computes the capacity of a person at a moment.
 *
 * @param personId the person
 * @param now milliseconds since the epoch
 * @param settings the settings with the slot table
 * @param holidays local dates of the public holidays
 * @param calendar calendar events of the person
 * @param recentEvents events of the last two days
 */
export function capacityFor(
    personId: number,
    now: number,
    settings: Settings,
    holidays: ReadonlySet<string>,
    calendar: readonly CalendarEvent[],
    recentEvents: readonly ChoreEvent[],
): CapacityResult {
    const slot = currentSlot(now, settings.time_zone, settings.capacity_slots, holidays);
    if (!slot) return { capacity: { minutes: 0, energy: 0 }, slot: null };
    const caps = capacityCaps(personId, slot.start, recentEvents);
    const energy = slot.slot.energy - (hasHangover(personId, now, recentEvents, settings) ? 1 : 0);
    return {
        capacity: {
            minutes: Math.max(0, Math.min(freeMinutes(slot, calendar), caps.minutes)),
            energy: Math.max(0, Math.min(energy, caps.energy)),
        },
        slot,
    };
}
