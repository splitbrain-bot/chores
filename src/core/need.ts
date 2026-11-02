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
    /** The earliest deadline that counts, also when it is over, or null. */
    nextDeadline: number | null;
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
 * Returns the start of the elapsed time of a chore. The start is the last done time, or half an interval before the
 * creation when the last done time is unknown, so such a chore begins at the need 0.5.
 *
 * @param chore the chore
 * @param settings the settings
 */
export function startAt(chore: Chore, settings: Settings): number {
    return chore.lastDoneAt ?? chore.createdAt - effectiveInterval(chore, settings) * DAY / 2;
}

/**
 * Returns the elapsed days of a chore since its start.
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
    const start = startAt(chore, ctx.settings);
    const total = clock(start, ctx.now);
    if (chore.seasonMonths.length === 0) return total / DAY;
    let inSeason = 0;
    for (const [a, b] of seasonParts(start, ctx.now, ctx.settings.time_zone, chore.seasonMonths)) {
        inSeason += clock(a, b);
    }
    const outside = Math.min(total - inSeason, effectiveInterval(chore, ctx.settings) * DAY);
    return (inSeason + outside) / DAY;
}

/**
 * Returns the days after a known done time in which a deadline or a trigger does not make a recurring chore urgent.
 *
 * @param chore the chore
 * @param settings the settings
 */
export function calmDays(chore: Chore, settings: Settings): number {
    return settings.urgent_min_need * effectiveInterval(chore, settings);
}

/**
 * Tells if a recurring chore has a known done time at most the given days before a moment, or after it.
 *
 * @param chore the chore
 * @param at milliseconds since the epoch
 * @param days the days before the moment
 */
function doneSince(chore: Chore, at: number, days: number): boolean {
    return chore.kind === 'recurring' && chore.lastDoneAt !== null && chore.lastDoneAt >= at - days * DAY;
}

/**
 * Returns the possible deadlines of a chore around a moment: the fixed deadline, or the yearly deadline of the year
 * before, of the year and of the year after. A deadline is the end of its local day.
 *
 * @param chore the chore
 * @param at milliseconds since the epoch
 * @param timeZone IANA time zone
 */
function deadlineCandidates(chore: Chore, at: number, timeZone: string): number[] {
    const result: number[] = [];
    if (chore.deadlineAt !== null) result.push(chore.deadlineAt);
    if (chore.deadlineMd !== null) {
        const year = localParts(at, timeZone).year;
        for (const y of [year - 1, year, year + 1]) {
            result.push(startOfDay(addDays(`${y}-${chore.deadlineMd}`, 1), timeZone));
        }
    }
    return result;
}

/**
 * Tells if a deadline counts for a chore. A deadline before the creation of the chore does not count. A known done
 * time of a recurring chore cancels the deadline when it is in the lead period, less than the calm days before the
 * deadline, or after the deadline.
 *
 * @param chore the chore
 * @param deadline the deadline timestamp
 * @param settings the settings
 */
function deadlineCounts(chore: Chore, deadline: number, settings: Settings): boolean {
    if (deadline < chore.createdAt) return false;
    return !doneSince(chore, deadline, Math.max(settings.deadline_lead_days, calmDays(chore, settings)));
}

/**
 * Returns the next deadline of a chore: the earliest deadline that counts, also when it is over. Returns null when
 * no deadline counts.
 *
 * @param chore the chore
 * @param now milliseconds since the epoch
 * @param settings the settings
 */
export function nextDeadline(chore: Chore, now: number, settings: Settings): number | null {
    const counting = deadlineCandidates(chore, now, settings.time_zone).filter((d) => deadlineCounts(chore, d, settings));
    return counting.length > 0 ? Math.min(...counting) : null;
}

/**
 * Returns the need level that a deadline adds, or null before its lead period.
 *
 * @param deadline the deadline timestamp
 * @param now milliseconds since the epoch
 * @param leadDays days before the deadline in which it applies
 */
export function deadlineNeed(deadline: number, now: number, leadDays: number): number | null {
    const lead = leadDays * DAY;
    const leadStart = deadline - lead;
    if (now < leadStart) return null;
    if (now <= deadline) return DEADLINE_LEVEL + (lead > 0 ? (now - leadStart) / lead : 1);
    return DEADLINE_LEVEL + 1 + (now - deadline) / DAY;
}

/**
 * Tells if the trigger of a chore applies: the condition is true, it became true after the start of the chore, and
 * the calm days after the last done time are over. The calm days keep a condition that changes often from making the
 * chore urgent again directly after a done tap.
 *
 * @param chore the chore
 * @param now milliseconds since the epoch
 * @param settings the settings
 */
export function triggerApplies(chore: Chore, now: number, settings: Settings): boolean {
    if (chore.triggerId === null || chore.triggerResult !== 1 || chore.triggerSinceAt === null) return false;
    return startAt(chore, settings) < chore.triggerSinceAt && !doneSince(chore, now, calmDays(chore, settings));
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

    const deadline = nextDeadline(chore, ctx.now, ctx.settings);
    const level = deadline === null ? null : deadlineNeed(deadline, ctx.now, ctx.settings.deadline_lead_days);
    if (deadline !== null && level !== null) {
        urgent = true;
        if (level > need) {
            need = level;
            reason = { code: 'deadline', deadline, overdueDays: Math.max(0, (ctx.now - deadline) / DAY) };
        }
    }

    if (triggerApplies(chore, ctx.now, ctx.settings)) {
        urgent = true;
        if (DEADLINE_LEVEL > need) {
            need = DEADLINE_LEVEL;
            reason = { code: 'trigger' };
        }
    }

    return { need, elapsed: el, urgent, reason, nextDeadline: deadline };
}
