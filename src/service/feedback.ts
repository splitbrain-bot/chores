import { done, earlier, EARLIER_LIMIT, postpone as corePostpone } from '../core/feedback.ts';
import type { ChoreWithNeed, PostponeReason, Viewer } from '../core/types.ts';
import { updateChore } from '../db/chores.ts';
import { getEvent, hasEarlierBetween, insertEvent } from '../db/events.ts';
import type { Deps } from './deps.ts';
import { notFound, ServiceError } from './errors.ts';
import { evaluate } from './evaluate.ts';

/** The id of a new done event per chore. */
export interface DoneEvent {
    choreId: number;
    eventId: number;
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
    const { chores } = await evaluate(deps, viewer, { ids });
    if (chores.length !== ids.length) throw notFound('Chore');
    const when = at ?? deps.now();
    if (when > deps.now()) throw new ServiceError(400, 'The time of a done event cannot be in the future');

    const events = await deps.db.transaction().execute(async (trx) => {
        const result: DoneEvent[] = [];
        for (const id of ids) {
            const chore = chores.find((c) => c.id === id)!;
            const change = done(chore, when, chore.need, personOf(viewer));
            await updateChore(trx, id, change.update);
            result.push({ choreId: id, eventId: await insertEvent(trx, change.event) });
        }
        return result;
    });
    if (chores.some((c) => c.kind === 'one_time')) deps.onChoresChanged?.();
    return events;
}

/**
 * Records that the chore of a done event was necessary earlier and shortens its interval.
 *
 * @param deps the dependencies
 * @param viewer the viewer
 * @param eventId the done event
 * @throws ServiceError 404 for an unknown event, 409 after the window or for a second call
 */
export async function markEarlier(deps: Deps, viewer: Viewer, eventId: number): Promise<ChoreWithNeed> {
    const event = await getEvent(deps.db, eventId);
    if (!event) throw notFound('Event');
    const chore = await evaluatedChore(deps, viewer, event.choreId, true);
    const used = await hasEarlierBetween(deps.db, chore.id, event.at, event.at + EARLIER_LIMIT);
    const result = earlier(chore, event, used, deps.now(), personOf(viewer));
    if (result && 'error' in result) {
        const messages = { not_done: 'The event is not a done event', window: 'The time for this tap is over',
            already: 'The tap was already used' };
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
 */
export async function postpone(deps: Deps, viewer: Viewer, choreId: number, reason: PostponeReason): Promise<ChoreWithNeed> {
    const { state, chores } = await evaluate(deps, viewer, { ids: [choreId] });
    const chore = chores[0];
    if (!chore) throw notFound('Chore');
    const change = corePostpone(chore, reason, {
        now: state.now,
        need: chore.need,
        elapsed: chore.elapsed,
        nextSlotAt: state.nextSlotAt,
        oneTimeSnoozeDays: state.settings.one_time_snooze_days,
        personId: personOf(viewer),
    });
    await deps.db.transaction().execute(async (trx) => {
        await updateChore(trx, chore.id, change.update);
        await insertEvent(trx, change.event);
    });
    return evaluatedChore(deps, viewer, chore.id);
}
