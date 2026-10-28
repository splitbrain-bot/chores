import { canLearn, learn, type Direction } from './learn.ts';
import { DEADLINE_LEVEL } from './need.ts';
import { DAY, type Chore, type ChoreEvent, type PostponeReason, type Settings } from './types.ts';

/** Longest snooze of a one-time task after not_yet. */
export const MAX_ONE_TIME_SNOOZE_DAYS = 56;

/** A new event without its id. */
export type NewEvent = Omit<ChoreEvent, 'id'>;

/** Changes of a chore and the event that records them. */
export interface FeedbackResult {
    update: Partial<Chore>;
    event: NewEvent;
}

/** Error of an earlier call. */
export type EarlierError = 'not_done' | 'stale' | 'overdue' | 'unknown_start';

/**
 * Returns the direction of a learning event, or null for an event without learning.
 *
 * @param event the event
 */
export function learnDirection(event: Pick<ChoreEvent, 'type' | 'reason'>): Direction | null {
    if (event.type === 'earlier') return -1;
    if (event.type === 'postpone' && event.reason === 'not_yet') return 1;
    return null;
}

/**
 * Builds the changes for a done tap.
 *
 * @param chore the chore
 * @param now time of the tap
 * @param need need level at the time of the tap
 * @param personId person of the viewer, or null
 */
export function done(chore: Chore, now: number, need: number, personId: number | null): FeedbackResult {
    const update: Partial<Chore> = { lastDoneAt: now, snoozedUntil: null, updatedAt: now };
    if (chore.kind === 'one_time') update.deletedAt = now;
    return {
        update,
        event: {
            choreId: chore.id, type: 'done', reason: null, at: now, personId, needLevel: need,
            intervalBefore: chore.interval, intervalAfter: chore.interval, durationMin: chore.durationMin,
            effort: chore.effort, startKnown: chore.lastDoneAt !== null,
        },
    };
}

/**
 * Returns the elapsed days of a done event from its need level and its interval. The need level of a recurring
 * chore without urgency is the elapsed time divided by the interval. The need level of an urgent chore does not
 * contain the elapsed time, so the result is null for it.
 *
 * @param doneEvent the done event, or its need level and interval
 * @returns the elapsed days, or null for a one-time task or an urgent chore
 */
function elapsedOf(doneEvent: Pick<ChoreEvent, 'needLevel' | 'intervalBefore'>): number | null {
    if (doneEvent.intervalBefore === null || doneEvent.needLevel >= DEADLINE_LEVEL) return null;
    return doneEvent.needLevel * doneEvent.intervalBefore;
}

/**
 * Tells if a done event allows the tap "the chore was necessary earlier". The tap is possible while it can shorten
 * the interval. A chore that was done late, for example because of the capacity, gives no information. An urgent
 * chore gives no information either, because the deadline or the trigger set the time of the done tap. A done event
 * without a known start gives no information, because its elapsed time counts from an assumed start.
 *
 * @param chore the chore
 * @param doneEvent the done event, or its need level, interval and start flag
 * @param settings the settings
 */
export function earlierAllowed(chore: Chore,
    doneEvent: Pick<ChoreEvent, 'needLevel' | 'intervalBefore' | 'startKnown'>, settings: Settings): boolean {
    const elapsed = elapsedOf(doneEvent);
    if (chore.kind !== 'recurring' || elapsed === null || !doneEvent.startKnown) return false;
    return canLearn(doneEvent.intervalBefore!, elapsed, -1, settings.learn_margin);
}

/**
 * Builds the changes for the tap "the chore was necessary earlier".
 *
 * @param chore the chore
 * @param doneEvent the done event that the tap refers to
 * @param lastEvent the last event of the chore
 * @param lastLearn the direction of the last learning event of the chore, or null
 * @param now time of the tap
 * @param personId person of the viewer, or null
 * @param settings the settings
 * @returns the changes, null for a one-time task, or the reason of the refusal
 */
export function earlier(chore: Chore, doneEvent: ChoreEvent, lastEvent: ChoreEvent | undefined,
    lastLearn: Direction | null, now: number, personId: number | null, settings: Settings):
    FeedbackResult | null | { error: EarlierError } {
    if (doneEvent.type !== 'done' || doneEvent.choreId !== chore.id) return { error: 'not_done' };
    if (lastEvent?.id !== doneEvent.id) return { error: 'stale' };
    if (chore.kind === 'one_time') return null;
    if (!doneEvent.startKnown) return { error: 'unknown_start' };
    if (!earlierAllowed(chore, doneEvent, settings)) return { error: 'overdue' };

    const interval = learn(chore.interval!, elapsedOf(doneEvent)!, -1, lastLearn === -1, settings);
    return {
        update: { interval, updatedAt: now },
        event: {
            choreId: chore.id, type: 'earlier', reason: null, at: now, personId, needLevel: doneEvent.needLevel,
            intervalBefore: chore.interval, intervalAfter: interval, durationMin: chore.durationMin,
            effort: chore.effort, startKnown: true,
        },
    };
}

/** Data for the snooze time of a postpone. */
export interface PostponeContext {
    now: number;
    need: number;
    /** Elapsed days since the last done event. */
    elapsed: number;
    /** Start of the next capacity slot, null when the slot table is empty. */
    nextSlotAt: number | null;
    /** Direction of the last learning event of the chore, or null. */
    lastLearn: Direction | null;
    settings: Settings;
    personId: number | null;
}

/**
 * Builds the changes for a postpone.
 *
 * @param chore the chore
 * @param reason the reason of the postpone
 * @param ctx the postpone context
 */
export function postpone(chore: Chore, reason: PostponeReason, ctx: PostponeContext): FeedbackResult {
    const { now } = ctx;
    const update: Partial<Chore> = { updatedAt: now };
    let intervalAfter = chore.interval;

    if (reason !== 'not_yet') {
        update.snoozedUntil = ctx.nextSlotAt ?? now + DAY;
    } else if (chore.kind === 'one_time') {
        const days = Math.min(ctx.settings.one_time_snooze_days * 2 ** chore.notYetCount, MAX_ONE_TIME_SNOOZE_DAYS);
        update.snoozedUntil = now + days * DAY;
        update.notYetCount = chore.notYetCount + 1;
    } else {
        intervalAfter = learn(chore.interval!, ctx.elapsed, 1, ctx.lastLearn === 1, ctx.settings);
        update.interval = intervalAfter;
        update.snoozedUntil = Math.max(now + (intervalAfter - ctx.elapsed) * DAY, now + DAY);
    }

    return {
        update,
        event: {
            choreId: chore.id, type: 'postpone', reason, at: now, personId: ctx.personId, needLevel: ctx.need,
            intervalBefore: chore.interval, intervalAfter, durationMin: chore.durationMin, effort: chore.effort,
            startKnown: true,
        },
    };
}
