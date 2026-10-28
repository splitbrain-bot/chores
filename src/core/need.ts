import { presenceBetween } from './clock.ts';
import { addDays, localParts, seasonParts, startOfDay } from './time.ts';
import { DAY, type Chore, type OccupancyRow, type Reason, type Settings } from './types.ts';

/** Data that the need level depends on, besides the chore. */
export interface NeedContext {
    now: number;
    settings: Settings;
    occupancy: readonly OccupancyRow[];
    firstRecordAt: number | null;
}

/** Result of the need computation of one chore. */
export interface NeedResult {
    need: number;
    elapsed: number;
    /** True when an active deadline or trigger raises the need level. */
    urgent: boolean;
    reason: Reason;
}

/** Lowest need level of an urgent chore. */
export const DEADLINE_LEVEL = 10;

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
 * Returns the elapsed days of a chore since the last done event.
 *
 * One-time tasks count wall-clock days since their creation. A chore that pauses when nobody is at home counts the
 * presence clock. A seasonal chore counts the time in its months fully and the time outside at most one interval,
 * so that it is due at the start of the season and not overdue by the whole pause.
 *
 * @param chore the chore
 * @param ctx the need context
 */
export function elapsed(chore: Chore, ctx: NeedContext): number {
    if (chore.kind === 'one_time') return (ctx.now - chore.createdAt) / DAY;
    const clock = (a: number, b: number) => (chore.pausesWhenAway
        ? presenceBetween(a, b, ctx.occupancy, ctx.firstRecordAt)
        : b - a);
    const total = clock(chore.lastDoneAt, ctx.now);
    if (chore.seasonMonths.length === 0) return total / DAY;
    let inSeason = 0;
    for (const [a, b] of seasonParts(chore.lastDoneAt, ctx.now, ctx.settings.time_zone, chore.seasonMonths)) {
        inSeason += clock(a, b);
    }
    const outside = Math.min(total - inSeason, effectiveInterval(chore, ctx.settings) * DAY);
    return (inSeason + outside) / DAY;
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
 * @param leadDays days before the deadline in which it applies
 */
export function deadlineNeed(chore: Chore, deadline: number, now: number, leadDays: number): number | null {
    const lead = leadDays * DAY;
    const leadStart = deadline - lead;
    if (deadline < chore.createdAt) return null;
    // a done one-time task is deleted, and a done time from the creation is no real done event
    const doneInPeriod = chore.kind === 'recurring' && chore.lastDoneAt > chore.createdAt && chore.lastDoneAt >= leadStart;
    if (doneInPeriod || now < leadStart) return null;
    if (now <= deadline) return DEADLINE_LEVEL + (lead > 0 ? (now - leadStart) / lead : 1);
    return DEADLINE_LEVEL + 1 + (now - deadline) / DAY;
}

/**
 * Tells if the trigger of a chore applies: the condition is true, it became true after the last done event, and
 * at least the minimum need has built up. The minimum need keeps a condition that changes often from making the
 * chore urgent again directly after a done tap.
 *
 * @param chore the chore
 * @param rawNeed the need level from the elapsed time
 * @param settings the settings
 */
export function triggerApplies(chore: Chore, rawNeed: number, settings: Settings): boolean {
    if (chore.triggerId === null || chore.triggerResult !== 1 || chore.triggerSinceAt === null) return false;
    return chore.lastDoneAt < chore.triggerSinceAt && rawNeed >= settings.trigger_min_need;
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
    const raw = interval > 0 ? el / interval : 0;
    // a one-time task never ranks above a recurring chore that is past its interval
    let need = chore.kind === 'one_time' ? Math.min(raw, 1) : raw;
    let reason: Reason = chore.kind === 'one_time'
        ? { code: 'one_time', ageDays: el }
        : { code: 'interval', interval, elapsed: el };
    let urgent = false;

    for (const deadline of deadlines(chore, ctx.now, ctx.settings.time_zone)) {
        const level = deadlineNeed(chore, deadline, ctx.now, ctx.settings.deadline_lead_days);
        if (level === null) continue;
        urgent = true;
        if (level > need) {
            need = level;
            reason = { code: 'deadline', deadline, overdueDays: Math.max(0, (ctx.now - deadline) / DAY) };
        }
    }

    if (triggerApplies(chore, raw, ctx.settings)) {
        urgent = true;
        if (DEADLINE_LEVEL > need) {
            need = DEADLINE_LEVEL;
            reason = { code: 'trigger' };
        }
    }

    return { need, elapsed: el, urgent, reason };
}
