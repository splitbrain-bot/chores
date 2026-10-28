import { done, earlier, earlierAllowed, learnDirection, postpone as corePostpone } from '../core/feedback.ts';
import type { Direction } from '../core/learn.ts';
import type { ChoreWithNeed, PostponeReason, Viewer } from '../core/types.ts';
import { updateChore } from '../db/chores.ts';
import { getEvent, insertEvent, lastEvent, lastLearnEvent } from '../db/events.ts';
import type { Deps } from './deps.ts';
import { notFound, ServiceError } from './errors.ts';
import { evaluate } from './evaluate.ts';

/** The id of a new done event per chore. */
export interface DoneEvent {
    choreId: number;
    eventId: number;
    /** True when the event allows the tap "necessary earlier". */
    earlier: boolean;
}

/**
 * Returns the person of a viewer.
 *
 * @param viewer the viewer
 */
function personOf(viewer: Viewer): number | null {
    return viewer.kind === 'person' ? viewer.personId : null;
}

/**
 * Loads one evaluated chore.
 *
 * @param deps the dependencies
 * @param viewer the viewer
 * @param id the chore id
 * @param includeDeleted true to find deleted chores too
 * @throws ServiceError when the chore does not exist
 */
export async function evaluatedChore(deps: Deps, viewer: Viewer, id: number, includeDeleted = false): Promise<ChoreWithNeed> {
    const { chores } = await evaluate(deps, viewer, { ids: [id], includeDeleted });
    const chore = chores[0];
    if (!chore) throw notFound('Chore');
    return chore;
}

/**
 * Marks a chore and the chosen chores of its group as done.
 *
 * @param deps the dependencies
 * @param viewer the viewer
 * @param choreId the main chore
 * @param also the chores that were done together with the main chore
 * @param at the time of the work, default now
 */
export async function markDone(deps: Deps, viewer: Viewer, choreId: number, also: readonly number[] = [],
    at?: number): Promise<DoneEvent[]> {
    const ids = [...new Set([choreId, ...also])];
    const { state, chores } = await evaluate(deps, viewer, { ids });
    if (chores.length !== ids.length) throw notFound('Chore');
    const when = at ?? deps.now();
    if (when > deps.now()) throw new ServiceError(400, 'The time of a done event cannot be in the future');

    const events = await deps.db.transaction().execute(async (trx) => {
        const result: DoneEvent[] = [];
        for (const id of ids) {
            const chore = chores.find((c) => c.id === id)!;
            const change = done(chore, when, chore.need, personOf(viewer));
            await updateChore(trx, id, change.update);
            const eventId = await insertEvent(trx, change.event);
            result.push({ choreId: id, eventId, earlier: earlierAllowed(chore, change.event, state.settings) });
        }
        return result;
    });
    return events;
}

/**
 * Returns the direction of the last learning event of a chore, or null.
 *
 * @param deps the dependencies
 * @param choreId the chore id
 */
async function lastLearn(deps: Deps, choreId: number): Promise<Direction | null> {
    const event = await lastLearnEvent(deps.db, choreId);
    return event ? learnDirection(event) : null;
}

/**
 * Records that the chore of a done event was necessary earlier and shortens its interval. The tap is possible
 * while the done event is the last event of the chore.
 *
 * @param deps the dependencies
 * @param viewer the viewer
 * @param eventId the done event
 * @throws ServiceError 404 for an unknown event or chore, 409 when the event is not the last done event, was late or
 *     had no known start
 */
export async function markEarlier(deps: Deps, viewer: Viewer, eventId: number): Promise<ChoreWithNeed> {
    const event = await getEvent(deps.db, eventId);
    if (!event) throw notFound('Event');
    const { state, chores } = await evaluate(deps, viewer, { ids: [event.choreId], includeDeleted: true });
    const chore = chores[0];
    if (!chore) throw notFound('Chore');
    const result = earlier(chore, event, await lastEvent(deps.db, chore.id), await lastLearn(deps, chore.id),
        deps.now(), personOf(viewer), state.settings);
    if (result && 'error' in result) {
        const messages = { not_done: 'The event is not a done event', stale: 'The chore has a newer event',
            overdue: 'The chore was done too late for this tap',
            unknown_start: 'The chore had no known last done date' };
        throw new ServiceError(409, messages[result.error]);
    }
    if (result) {
        await deps.db.transaction().execute(async (trx) => {
            await updateChore(trx, chore.id, result.update);
            await insertEvent(trx, result.event);
        });
    }
    return evaluatedChore(deps, viewer, chore.id, true);
}

/**
 * Postpones a chore.
 *
 * @param deps the dependencies
 * @param viewer the viewer
 * @param choreId the chore
 * @param reason the reason
 * @throws ServiceError 404 for an unknown chore, 409 for not_yet on a recurring chore without a known last done date
 */
export async function postpone(deps: Deps, viewer: Viewer, choreId: number, reason: PostponeReason): Promise<ChoreWithNeed> {
    const { state, chores } = await evaluate(deps, viewer, { ids: [choreId] });
    const chore = chores[0];
    if (!chore) throw notFound('Chore');
    // not_yet learns from the elapsed time, which needs a known start
    if (reason === 'not_yet' && chore.kind === 'recurring' && chore.lastDoneAt === null) {
        throw new ServiceError(409, 'The chore has no known last done date');
    }
    const change = corePostpone(chore, reason, {
        now: state.now,
        need: chore.need,
        elapsed: chore.elapsed,
        nextSlotAt: state.nextSlotAt,
        lastLearn: await lastLearn(deps, chore.id),
        settings: state.settings,
        personId: personOf(viewer),
    });
    await deps.db.transaction().execute(async (trx) => {
        await updateChore(trx, chore.id, change.update);
        await insertEvent(trx, change.event);
    });
    return evaluatedChore(deps, viewer, chore.id);
}
