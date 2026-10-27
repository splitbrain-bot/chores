import { busyMinutes } from './capacity.ts';
import { effectiveInterval } from './need.ts';
import { candidates } from './possible.ts';
import { addDays, inSeason, isQuietDay, localDate, slotsOfDay, startOfDay } from './time.ts';
import { DAY, type CalendarEvent, type ChoreWithNeed, type ForecastDay, type Hint, type HintReason, type Settings }
    from './types.ts';

/** Data for the look-ahead. */
export interface LookaheadContext {
    now: number;
    settings: Settings;
    personIds: readonly number[];
    holidays: ReadonlySet<string>;
    /** Calendar events per person. */
    calendars: ReadonlyMap<number, readonly CalendarEvent[]>;
    /** Daily forecast per local date. */
    forecast: ReadonlyMap<string, ForecastDay>;
    /** Result of the forecast template per chore id and local date, null for a render error. */
    forecastResults: ReadonlyMap<number, ReadonlyMap<string, boolean | null>>;
}

/**
 * Tells if a chore needs a look-ahead hint at all.
 *
 * @param chore the chore
 * @param personIds ids of all persons
 */
export function isLookaheadCandidate(chore: ChoreWithNeed, personIds: readonly number[]): boolean {
    if (chore.deletedAt !== null) return false;
    if (chore.forecastTemplate !== null || chore.noisy) return true;
    return chore.assignment === 'all' && candidates(chore, personIds).length > 1;
}

/**
 * Returns the free minutes of a person on a day: the slot minutes of the weekday minus the busy calendar time in
 * the slots.
 *
 * @param date local date YYYY-MM-DD
 * @param events calendar events of the person
 * @param ctx the look-ahead context
 */
export function freeMinutesOnDay(date: string, events: readonly CalendarEvent[], ctx: LookaheadContext): number {
    const tz = ctx.settings.time_zone;
    let free = 0;
    for (const placed of slotsOfDay(date, tz, ctx.settings.capacity_slots, ctx.holidays)) {
        free += placed.slot.minutes - busyMinutes(events, placed.start, placed.end);
    }
    return Math.max(0, Math.floor(free));
}

/**
 * Computes the look-ahead hints for the next days. Each chore gets a hint for the first day that fits.
 *
 * @param chores the evaluated chores
 * @param ctx the look-ahead context
 */
export function lookahead(chores: readonly ChoreWithNeed[], ctx: LookaheadContext): Hint[] {
    const tz = ctx.settings.time_zone;
    const today = localDate(ctx.now, tz);
    const hints: Hint[] = [];

    for (const chore of chores) {
        if (!isLookaheadCandidate(chore, ctx.personIds)) continue;
        const persons = candidates(chore, ctx.personIds);
        const interval = effectiveInterval(chore, ctx.settings);

        for (let i = 1; i <= ctx.settings.lookahead_days; i++) {
            const date = addDays(today, i);
            const hint = checkDay(chore, date, interval, persons, ctx);
            if (hint) {
                hints.push(hint);
                break;
            }
        }
    }
    return hints.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Checks one day for one chore.
 *
 * @param chore the evaluated chore
 * @param date local date YYYY-MM-DD
 * @param interval the interval of the chore
 * @param persons candidate persons of the chore
 * @param ctx the look-ahead context
 * @returns the hint, or null when the day does not fit
 */
function checkDay(chore: ChoreWithNeed, date: string, interval: number, persons: readonly number[],
    ctx: LookaheadContext): Hint | null {
    const tz = ctx.settings.time_zone;
    const reasons: HintReason[] = [];

    const month = Number(date.slice(5, 7));
    if (!inSeason(month, chore.seasonFrom, chore.seasonTo)) return null;

    const growth = chore.elapsedUnit === 'days' && interval > 0 ? (startOfDay(date, tz) - ctx.now) / DAY / interval : 0;
    if (!chore.urgent && chore.need + growth < ctx.settings.suggest_threshold) return null;

    if (chore.forecastTemplate !== null) {
        if (ctx.forecastResults.get(chore.id)?.get(date) !== true) return null;
        const day = ctx.forecast.get(date);
        reasons.push({
            code: 'weather',
            condition: day?.condition ?? null,
            temperature: day?.temperature ?? null,
            precipitation: day?.precipitation ?? null,
        });
    }

    if (chore.noisy) {
        if (isQuietDay(date, ctx.holidays)) return null;
        reasons.push({ code: 'quiet_day' });
    }

    const free = persons.map((id) => freeMinutesOnDay(date, ctx.calendars.get(id) ?? [], ctx));
    const minutes = chore.assignment === 'all' ? Math.min(...free) : Math.max(...free);
    if (!(chore.durationMin <= minutes)) return null;
    if (chore.assignment === 'all' && persons.length > 1) reasons.push({ code: 'all_free' });
    reasons.push({ code: 'free_time', minutes });

    return { choreId: chore.id, choreName: chore.name, date, reasons };
}
