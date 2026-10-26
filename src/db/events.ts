import type { ChoreEvent } from '../core/types.ts';
import type { Database } from './database.ts';

/** An event with the name of its chore. */
export interface EventWithChore extends ChoreEvent {
    choreName: string;
}

/**
 * Inserts an event.
 *
 * @param db the database
 * @param event the event without id
 * @returns the new event id
 */
export async function insertEvent(db: Database, event: Omit<ChoreEvent, 'id'>): Promise<number> {
    const row = await db.insertInto('event').values(event).returning('id').executeTakeFirstOrThrow();
    return row.id;
}

/**
 * Returns one event.
 *
 * @param db the database
 * @param id the event id
 */
export async function getEvent(db: Database, id: number): Promise<ChoreEvent | undefined> {
    return db.selectFrom('event').selectAll().where('id', '=', id).executeTakeFirst();
}

/**
 * Lists the latest events of a chore, newest first.
 *
 * @param db the database
 * @param choreId the chore id
 * @param limit the maximum number of events
 */
export async function listChoreEvents(db: Database, choreId: number, limit = 20): Promise<ChoreEvent[]> {
    return db.selectFrom('event').selectAll().where('choreId', '=', choreId)
        .orderBy('at', 'desc').orderBy('id', 'desc').limit(limit).execute();
}

/**
 * Lists the latest events of all chores with the chore names, newest first.
 *
 * @param db the database
 * @param limit the maximum number of events
 */
export async function listRecentEvents(db: Database, limit = 30): Promise<EventWithChore[]> {
    return db.selectFrom('event').innerJoin('chore', 'chore.id', 'event.choreId')
        .selectAll('event').select('chore.name as choreName')
        .orderBy('event.at', 'desc').orderBy('event.id', 'desc').limit(limit).execute();
}

/**
 * Lists the done events since a moment.
 *
 * @param db the database
 * @param since milliseconds since the epoch
 */
export async function listDoneSince(db: Database, since: number): Promise<ChoreEvent[]> {
    return db.selectFrom('event').selectAll().where('type', '=', 'done').where('at', '>=', since).orderBy('at').execute();
}

/**
 * Tells if an earlier event of a chore exists in a period.
 *
 * @param db the database
 * @param choreId the chore id
 * @param from start of the period
 * @param to end of the period
 */
export async function hasEarlierBetween(db: Database, choreId: number, from: number, to: number): Promise<boolean> {
    const row = await db.selectFrom('event').select('id').where('choreId', '=', choreId).where('type', '=', 'earlier')
        .where('at', '>=', from).where('at', '<=', to).executeTakeFirst();
    return row !== undefined;
}
