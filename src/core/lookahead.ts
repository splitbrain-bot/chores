import { busyMinutes } from './capacity.ts';
import { effectiveInterval } from './need.ts';
import { candidates, together } from './possible.ts';
import { addDays, inSeason, isQuietDay, localDate, slotsOfDay, startOfDay } from './time.ts';
import { DAY, type CalendarEvent, type Capacity, type ChoreWithNeed, type ForecastDay, type Hint, type HintReason,
    type Settings } from './types.ts';

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
    /** Result of the forecast template per chore id and local date, null for a render error. Only chores whose
     * required condition has a forecast template have an entry. */
    forecastResults: ReadonlyMap<number, ReadonlyMap<string, boolean | null>>;
}

/**
 * Returns the start of the lead period of the next deadline of a chore, or null without a deadline.
 *
 * @param chore the chore
 * @param settings the settings
 */
function leadStart(chore: ChoreWithNeed, settings: Settings): number | null {
    return chore.nextDeadline === null ? null : chore.nextDeadline - settings.deadline_lead_days * DAY;
}

/**
 * Tells if a chore needs a look-ahead hint at all: it has a forecast condition, it is noisy, it needs more persons,
 * a deadline makes it urgent in the look-ahead days, or only the capacity blocks it now.
 *
 * @param chore the chore
 * @param hasForecast true when the required condition of the chore has a forecast template
 * @param ctx the look-ahead context
 */
export function isLookaheadCandidate(chore: ChoreWithNeed, hasForecast: boolean, ctx: LookaheadContext): boolean {
    if (chore.deletedAt !== null) return false;
    if (hasForecast || chore.noisy || together(chore)) return true;
    const lead = leadStart(chore, ctx.settings);
    if (!chore.possible && lead !== null && lead <= ctx.now + ctx.settings.lookahead_days * DAY) return true;
    return chore.blockedBy.length === 1 && chore.blockedBy[0] === 'capacity';
}

/**
 * Returns the free capacity of a person on a day: the slot minutes of the weekday minus the busy calendar time in
 * the slots, and the highest energy of the slots with free time. On the current day only the time from now counts.
 *
 * @param date local date YYYY-MM-DD
 * @param events calendar events of the person
 * @param ctx the look-ahead context
 */
export function freeOnDay(date: string, events: readonly CalendarEvent[], ctx: LookaheadContext): Capacity {
    const tz = ctx.settings.time_zone;
    let minutes = 0;
    let energy = 0;
    for (const placed of slotsOfDay(date, tz, ctx.settings.capacity_slots, ctx.holidays)) {
        if (placed.end <= ctx.now) continue;
        const free = placed.slot.minutes - busyMinutes(events, Math.max(placed.start, ctx.now), placed.end);
        if (free <= 0) continue;
        minutes += free;
        energy = Math.max(energy, placed.slot.energy);
    }
    return { minutes: Math.floor(minutes), energy };
}

/**
 * Computes the look-ahead hints for the rest of today and the next days. Each chore gets a hint for the first day
 * that fits. A chore with forecast results in the context needs a good forecast day, or today its current result.
 *
 * @param chores the evaluated chores
 * @param ctx the look-ahead context
 */
export function lookahead(chores: readonly ChoreWithNeed[], ctx: LookaheadContext): Hint[] {
    const tz = ctx.settings.time_zone;
    const today = localDate(ctx.now, tz);
    const hints: Hint[] = [];

    for (const chore of chores) {
        if (!isLookaheadCandidate(chore, ctx.forecastResults.has(chore.id), ctx)) continue;
        const persons = candidates(chore, ctx.personIds);
        const interval = effectiveInterval(chore, ctx.settings);

        for (let i = 0; i <= ctx.settings.lookahead_days; i++) {
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
    if (!inSeason(month, chore.seasonMonths)) return null;

    const dayStart = startOfDay(date, tz);
    const lead = leadStart(chore, ctx.settings);
    const dueOnDay = lead !== null && dayStart >= lead;
    const growth = interval > 0 ? Math.max(0, dayStart - ctx.now) / DAY / interval : 0;
    if (!chore.urgent && !dueOnDay && chore.need + growth < ctx.settings.suggest_threshold) return null;
    if (dueOnDay) reasons.push({ code: 'deadline', deadline: chore.nextDeadline! });

    const forecast = ctx.forecastResults.get(chore.id);
    if (forecast) {
        const good = date === localDate(ctx.now, tz) ? chore.requiresResult === 1 : forecast.get(date) === true;
        if (!good) return null;
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

    const free = persons.map((id) => freeOnDay(date, ctx.calendars.get(id) ?? [], ctx));
    const pick = together(chore) ? Math.min : Math.max;
    const minutes = pick(...free.map((f) => f.minutes));
    const energy = pick(...free.map((f) => f.energy));
    if (!(chore.durationMin <= minutes && chore.effort <= energy)) return null;
    if (together(chore)) reasons.push({ code: 'all_free' });
    reasons.push({ code: 'free_time', minutes });

    return { choreId: chore.id, choreName: chore.name, date, reasons };
}
