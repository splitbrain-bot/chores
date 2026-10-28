import type { ChoreEvent } from '../core/types.ts';
import type { Database } from './database.ts';
import type { EventRow } from './types.ts';

/** An event with the name of its chore. */
export interface EventWithChore extends ChoreEvent {
    choreName: string;
}

/**
 * Converts a row to an event.
 *
 * @param row the row
 */
function toEvent<T extends EventRow>(row: T): Omit<T, 'startKnown'> & { startKnown: boolean } {
    return { ...row, startKnown: row.startKnown === 1 };
}

/**
 * Inserts an event.
 *
 * @param db the database
 * @param event the event without id
 * @returns the new event id
 */
export async function insertEvent(db: Database, event: Omit<ChoreEvent, 'id'>): Promise<number> {
    const row = await db.insertInto('event').values({ ...event, startKnown: event.startKnown ? 1 : 0 })
        .returning('id').executeTakeFirstOrThrow();
    return row.id;
}

/**
 * Returns one event.
 *
 * @param db the database
 * @param id the event id
 */
export async function getEvent(db: Database, id: number): Promise<ChoreEvent | undefined> {
    const row = await db.selectFrom('event').selectAll().where('id', '=', id).executeTakeFirst();
    return row && toEvent(row);
}

/**
 * Lists the latest events of a chore, newest first.
 *
 * @param db the database
 * @param choreId the chore id
 * @param limit the maximum number of events
 */
export async function listChoreEvents(db: Database, choreId: number, limit = 20): Promise<ChoreEvent[]> {
    const rows = await db.selectFrom('event').selectAll().where('choreId', '=', choreId)
        .orderBy('at', 'desc').orderBy('id', 'desc').limit(limit).execute();
    return rows.map(toEvent);
}

/**
 * Lists the latest events of all chores with the chore names, newest first.
 *
 * @param db the database
 * @param limit the maximum number of events
 */
export async function listRecentEvents(db: Database, limit = 30): Promise<EventWithChore[]> {
    const rows = await db.selectFrom('event').innerJoin('chore', 'chore.id', 'event.choreId')
        .selectAll('event').select('chore.name as choreName')
        .orderBy('event.at', 'desc').orderBy('event.id', 'desc').limit(limit).execute();
    return rows.map(toEvent);
}

/**
 * Lists the events since a moment.
 *
 * @param db the database
 * @param since milliseconds since the epoch
 */
export async function listEventsSince(db: Database, since: number): Promise<ChoreEvent[]> {
    const rows = await db.selectFrom('event').selectAll().where('at', '>=', since).orderBy('at').orderBy('id')
        .execute();
    return rows.map(toEvent);
}

/**
 * Returns the last event of a chore.
 *
 * @param db the database
 * @param choreId the chore id
 */
export async function lastEvent(db: Database, choreId: number): Promise<ChoreEvent | undefined> {
    return (await listChoreEvents(db, choreId, 1))[0];
}

/**
 * Returns the last learning event of a chore: an earlier event or a postpone with the reason not_yet.
 *
 * @param db the database
 * @param choreId the chore id
 */
export async function lastLearnEvent(db: Database, choreId: number): Promise<ChoreEvent | undefined> {
    const row = await db.selectFrom('event').selectAll().where('choreId', '=', choreId)
        .where((eb) => eb.or([eb('type', '=', 'earlier'), eb('reason', '=', 'not_yet')]))
        .orderBy('at', 'desc').orderBy('id', 'desc').executeTakeFirst();
    return row && toEvent(row);
}
