import { presenceBetween } from './clock.ts';
import { addDays, localParts, seasonParts, startOfDay } from './time.ts';
import { DAY, type Chore, type OccupancyRow, type Reason, type Settings } from './types.ts';

/** Data that the need level depends on, besides the chore. */
export interface NeedContext {
    now: number;
    settings: Settings;
    occupancy: readonly OccupancyRow[];
    firstRecordAt: number | null;
    /** Completed cycles since the last done event per chore id. */
    cycles: ReadonlyMap<number, number>;
}

/** Result of the need computation of one chore. */
export interface NeedResult {
    need: number;
    elapsed: number;
    unit: 'days' | 'cycles';
    /** True when an active deadline or boost raises the need level. */
    urgent: boolean;
    reason: Reason;
}

/** Need level of an active deadline at the start of the lead period. */
export const DEADLINE_LEVEL = 10;

/**
 * Counts the completed cycles in a state sequence. A cycle is a change from on to off. Other states are ignored.
 *
 * @param states the states in time order
 * @param initial the last valid state before the sequence
 */
export function countCycles(states: readonly string[], initial: string | null = null): number {
    let last = initial === 'on' || initial === 'off' ? initial : null;
    let count = 0;
    for (const state of states) {
        if (state !== 'on' && state !== 'off') continue;
        if (last === 'on' && state === 'off') count++;
        last = state;
    }
    return count;
}

/**
 * Returns the slope of the need level after the interval for an importance.
 *
 * @param chore the chore
 * @param settings the settings with the slopes
 */
function slope(chore: Chore, settings: Settings): number {
    return settings[`slope.${chore.importance}`];
}

/**
 * Returns the interval of a chore. One-time tasks use the reference interval.
 *
 * @param chore the chore
 * @param settings the settings
 */
export function effectiveInterval(chore: Chore, settings: Settings): number {
    if (chore.kind === 'one_time' || chore.interval === null) return settings.one_time_reference_days;
    return chore.interval;
}

/**
 * Returns the elapsed value of a chore since the last done event.
 *
 * One-time tasks count wall-clock days since their creation. Time and usage chores with a season window count only
 * the time inside the window.
 *
 * @param chore the chore
 * @param ctx the need context
 */
export function elapsed(chore: Chore, ctx: NeedContext): { value: number; unit: 'days' | 'cycles' } {
    if (chore.kind !== 'one_time' && chore.growth === 'counter') return { value: ctx.cycles.get(chore.id) ?? 0, unit: 'cycles' };
    const since = chore.kind === 'one_time' ? chore.createdAt : chore.lastDoneAt;
    const usage = chore.kind === 'recurring' && chore.growth === 'usage';
    let ms = 0;
    for (const [a, b] of seasonParts(since, ctx.now, ctx.settings.time_zone, chore.seasonMonths)) {
        ms += usage ? presenceBetween(a, b, ctx.occupancy, ctx.firstRecordAt) : b - a;
    }
    return { value: ms / DAY, unit: 'days' };
}

/**
 * Returns the deadlines of a chore that can apply now: the fixed deadline, or the yearly deadline of the last and of
 * the current year. A deadline is the end of its local day.
 *
 * @param chore the chore
 * @param now milliseconds since the epoch
 * @param timeZone IANA time zone
 */
export function deadlines(chore: Chore, now: number, timeZone: string): number[] {
    const result: number[] = [];
    if (chore.deadlineAt !== null) result.push(chore.deadlineAt);
    if (chore.deadlineMd !== null) {
        const year = localParts(now, timeZone).year;
        for (const y of [year - 1, year]) {
            result.push(startOfDay(addDays(`${y}-${chore.deadlineMd}`, 1), timeZone));
        }
    }
    return result;
}

/**
 * Returns the need level that a deadline adds, or null when the deadline does not apply. A deadline before the
 * creation of the chore never applies. A done time counts for the lead period only when it is after the creation.
 *
 * @param chore the chore
 * @param deadline the deadline timestamp
 * @param now milliseconds since the epoch
 */
function deadlineNeed(chore: Chore, deadline: number, now: number): number | null {
    const lead = chore.deadlineLeadDays * DAY;
    const leadStart = deadline - lead;
    if (deadline < chore.createdAt) return null;
    // a done one-time task is deleted, and a done time from the creation is no real done event
    const doneInPeriod = chore.kind === 'recurring' && chore.lastDoneAt > chore.createdAt && chore.lastDoneAt >= leadStart;
    if (doneInPeriod || now < leadStart) return null;
    if (now <= deadline) return DEADLINE_LEVEL + (lead > 0 ? (now - leadStart) / lead : 1);
    return DEADLINE_LEVEL + 1 + (now - deadline) / DAY;
}

/**
 * Computes the need level of a chore.
 *
 * @param chore the chore
 * @param ctx the need context
 */
export function computeNeed(chore: Chore, ctx: NeedContext): NeedResult {
    const interval = effectiveInterval(chore, ctx.settings);
    const el = elapsed(chore, ctx);
    const raw = interval > 0 ? el.value / interval : 0;
    let need = raw <= 1 ? raw : 1 + (raw - 1) * slope(chore, ctx.settings);
    let reason: Reason = chore.kind === 'one_time'
        ? { code: 'one_time', ageDays: el.value }
        : { code: 'interval', interval, elapsed: el.value, unit: el.unit };
    let urgent = false;

    for (const deadline of deadlines(chore, ctx.now, ctx.settings.time_zone)) {
        const level = deadlineNeed(chore, deadline, ctx.now);
        if (level === null) continue;
        urgent = true;
        if (level > need) {
            need = level;
            reason = { code: 'deadline', deadline, overdueDays: Math.max(0, (ctx.now - deadline) / DAY) };
        }
    }

    if (chore.boostId !== null && chore.boostResult === 1) {
        urgent = true;
        if (DEADLINE_LEVEL > need) {
            need = DEADLINE_LEVEL;
            reason = { code: 'boost' };
        }
    }

    return { need, elapsed: el.value, unit: el.unit, urgent, reason };
}
