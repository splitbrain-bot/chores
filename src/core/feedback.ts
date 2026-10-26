import { learn } from './learn.ts';
import { DAY, type Chore, type ChoreEvent, type PostponeReason } from './types.ts';

/** Time after a done event in which an earlier call is allowed. */
export const EARLIER_LIMIT = 60_000;

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
export type EarlierError = 'not_done' | 'window' | 'already';

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
            intervalBefore: chore.interval, intervalAfter: chore.interval, effort: chore.effort,
        },
    };
}

/**
 * Builds the changes for the tap "the chore was necessary earlier".
 *
 * @param chore the chore
 * @param doneEvent the done event that the tap refers to
 * @param alreadyUsed true when the done event already has an earlier event
 * @param now time of the tap
 * @param personId person of the viewer, or null
 * @returns the changes, null for a one-time task, or the reason of the refusal
 */
export function earlier(chore: Chore, doneEvent: ChoreEvent, alreadyUsed: boolean, now: number,
    personId: number | null): FeedbackResult | null | { error: EarlierError } {
    if (doneEvent.type !== 'done' || doneEvent.choreId !== chore.id) return { error: 'not_done' };
    if (alreadyUsed) return { error: 'already' };
    if (now - doneEvent.at > EARLIER_LIMIT || now < doneEvent.at) return { error: 'window' };
    if (chore.kind === 'one_time') return null;

    const learned = learn(chore, -1);
    return {
        update: { ...learned, updatedAt: now },
        event: {
            choreId: chore.id, type: 'earlier', reason: null, at: now, personId, needLevel: doneEvent.needLevel,
            intervalBefore: chore.interval, intervalAfter: learned.interval, effort: chore.effort,
        },
    };
}

/** Data for the snooze time of a postpone. */
export interface PostponeContext {
    now: number;
    need: number;
    /** Elapsed days or cycles since the last done event. */
    elapsed: number;
    /** Start of the next capacity slot, null when the slot table is empty. */
    nextSlotAt: number | null;
    oneTimeSnoozeDays: number;
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
        const days = Math.min(ctx.oneTimeSnoozeDays * 2 ** chore.notYetCount, MAX_ONE_TIME_SNOOZE_DAYS);
        update.snoozedUntil = now + days * DAY;
        update.notYetCount = chore.notYetCount + 1;
    } else {
        const learned = learn(chore, 1);
        Object.assign(update, learned);
        intervalAfter = learned.interval;
        update.snoozedUntil = Math.max(dueAt(chore, learned.interval, ctx), now + DAY);
    }

    return {
        update,
        event: {
            choreId: chore.id, type: 'postpone', reason, at: now, personId: ctx.personId, needLevel: ctx.need,
            intervalBefore: chore.interval, intervalAfter, effort: chore.effort,
        },
    };
}

/**
 * Estimates the time at which the need level of a recurring chore reaches 1. Usage chores assume full presence.
 * Counter chores have no estimate and return the current time.
 *
 * @param chore the chore
 * @param interval the interval to use
 * @param ctx the postpone context
 */
function dueAt(chore: Chore, interval: number, ctx: PostponeContext): number {
    switch (chore.growth) {
        case 'time':
            return chore.lastDoneAt + interval * DAY;
        case 'usage':
            return ctx.now + (interval - ctx.elapsed) * DAY;
        case 'counter':
            return ctx.now;
    }
}
