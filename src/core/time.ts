import { DAY, MINUTE, type DayType, type Slot } from './types.ts';

/** Local calendar fields of a timestamp. */
export interface LocalParts {
    /** Local date YYYY-MM-DD. */
    date: string;
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    /** 0 is Sunday, 6 is Saturday. */
    weekday: number;
}

/** A capacity slot placed on a concrete day. */
export interface PlacedSlot {
    slot: Slot;
    start: number;
    end: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Returns a cached formatter that gives the numeric local fields in a time zone.
 *
 * @param timeZone IANA time zone
 */
function formatter(timeZone: string): Intl.DateTimeFormat {
    let f = formatters.get(timeZone);
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        formatters.set(timeZone, f);
    }
    return f;
}

/**
 * Splits a timestamp into its local calendar fields.
 *
 * @param ts milliseconds since the epoch
 * @param timeZone IANA time zone
 */
export function localParts(ts: number, timeZone: string): LocalParts {
    const fields: Record<string, number> = {};
    for (const part of formatter(timeZone).formatToParts(ts)) {
        if (part.type !== 'literal') fields[part.type] = Number(part.value);
    }
    const year = fields.year!;
    const month = fields.month!;
    const day = fields.day!;
    const date = `${year}-${pad(month)}-${pad(day)}`;
    return { date, year, month, day, hour: fields.hour!, minute: fields.minute!, weekday: weekdayOf(date) };
}

/**
 * Returns the local date of a timestamp as YYYY-MM-DD.
 *
 * @param ts milliseconds since the epoch
 * @param timeZone IANA time zone
 */
export function localDate(ts: number, timeZone: string): string {
    return localParts(ts, timeZone).date;
}

/**
 * Adds a number of days to a local date.
 *
 * @param date local date YYYY-MM-DD
 * @param days number of days, can be negative
 */
export function addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/**
 * Returns the weekday of a local date, 0 is Sunday.
 *
 * @param date local date YYYY-MM-DD
 */
export function weekdayOf(date: string): number {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * Returns the day type of a local date. Friday to Sunday and public holidays are weekend days.
 *
 * @param date local date YYYY-MM-DD
 * @param holidays local dates of the public holidays
 */
export function dayTypeOf(date: string, holidays: ReadonlySet<string>): DayType {
    const wd = weekdayOf(date);
    if (holidays.has(date) || wd === 0 || wd >= 5) return 'weekend';
    return 'workday';
}

/**
 * Tells if a local date is a Sunday or a public holiday, the days without noisy work.
 *
 * @param date local date YYYY-MM-DD
 * @param holidays local dates of the public holidays
 */
export function isQuietDay(date: string, holidays: ReadonlySet<string>): boolean {
    return weekdayOf(date) === 0 || holidays.has(date);
}

/**
 * Tells if a month is inside a season window. A window with from greater than to wraps over the new year.
 *
 * @param month month 1 to 12
 * @param from first month of the window, null for no window
 * @param to last month of the window, null for no window
 */
export function inSeason(month: number, from: number | null, to: number | null): boolean {
    if (from === null || to === null) return true;
    if (from <= to) return month >= from && month <= to;
    return month >= from || month <= to;
}

/**
 * Converts a local date and time to a timestamp.
 *
 * @param date local date YYYY-MM-DD
 * @param time local time HH:MM
 * @param timeZone IANA time zone
 * @returns milliseconds since the epoch
 */
export function zonedTime(date: string, time: string, timeZone: string): number {
    const wanted = Date.parse(`${date}T${time}:00Z`);
    let ts = wanted;
    // two passes find the offset also next to a daylight saving change
    for (let i = 0; i < 2; i++) {
        const p = localParts(ts, timeZone);
        const shown = Date.parse(`${p.date}T${pad(p.hour)}:${pad(p.minute)}:00Z`);
        ts += wanted - shown;
    }
    return ts;
}

/**
 * Returns the start of a local date as a timestamp.
 *
 * @param date local date YYYY-MM-DD
 * @param timeZone IANA time zone
 */
export function startOfDay(date: string, timeZone: string): number {
    return zonedTime(date, '00:00', timeZone);
}

/**
 * Returns the capacity slots of a local date with their timestamps, sorted by start.
 *
 * @param date local date YYYY-MM-DD
 * @param timeZone IANA time zone
 * @param slots the slot table of all day types
 * @param holidays local dates of the public holidays
 */
export function slotsOfDay(date: string, timeZone: string, slots: Slot[], holidays: ReadonlySet<string>): PlacedSlot[] {
    const type = dayTypeOf(date, holidays);
    return slots
        .filter((s) => s.dayType === type)
        .map((slot) => ({ slot, start: zonedTime(date, slot.from, timeZone), end: zonedTime(date, slot.to, timeZone) }))
        .sort((a, b) => a.start - b.start);
}

/**
 * Finds the slot that contains a moment. A slot contains its start and not its end.
 *
 * @param now milliseconds since the epoch
 * @param timeZone IANA time zone
 * @param slots the slot table of all day types
 * @param holidays local dates of the public holidays
 * @returns the slot or null outside of all slots
 */
export function currentSlot(now: number, timeZone: string, slots: Slot[], holidays: ReadonlySet<string>): PlacedSlot | null {
    const date = localDate(now, timeZone);
    return slotsOfDay(date, timeZone, slots, holidays).find((s) => s.start <= now && now < s.end) ?? null;
}

/**
 * Finds the start of the first slot after a moment.
 *
 * @param now milliseconds since the epoch
 * @param timeZone IANA time zone
 * @param slots the slot table of all day types
 * @param holidays local dates of the public holidays
 * @returns the start of the next slot, or null when the table has no slot
 */
export function nextSlotStart(now: number, timeZone: string, slots: Slot[], holidays: ReadonlySet<string>): number | null {
    const today = localDate(now, timeZone);
    for (let i = 0; i <= 8; i++) {
        const next = slotsOfDay(addDays(today, i), timeZone, slots, holidays).find((s) => s.start > now);
        if (next) return next.start;
    }
    return null;
}

/**
 * Returns the length of a placed slot in minutes.
 *
 * @param placed the slot with timestamps
 */
export function slotLengthMinutes(placed: PlacedSlot): number {
    return (placed.end - placed.start) / MINUTE;
}

/**
 * Converts milliseconds to days.
 *
 * @param ms duration in milliseconds
 */
export function toDays(ms: number): number {
    return ms / DAY;
}

/**
 * Pads a number to two digits.
 *
 * @param n number from 0 to 99
 */
function pad(n: number): string {
    return String(n).padStart(2, '0');
}
