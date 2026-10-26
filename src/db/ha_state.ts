import type { StateRecord } from '../core/types.ts';
import type { Database } from './database.ts';

/**
 * Inserts state records.
 *
 * @param db the database
 * @param records the records
 */
export async function insertStates(db: Database, records: readonly StateRecord[]): Promise<void> {
    if (records.length === 0) return;
    await db.insertInto('haState').values(records.map((r) => ({ ...r }))).execute();
}

/**
 * Returns the time of the latest state record of any entity.
 *
 * @param db the database
 */
export async function lastStateAt(db: Database): Promise<number | null> {
    const row = await db.selectFrom('haState').select((eb) => eb.fn.max('at').as('at')).executeTakeFirst();
    return row?.at ?? null;
}

/**
 * Returns the time of the first state record of some entities.
 *
 * @param db the database
 * @param entityIds the entities
 */
export async function firstStateAt(db: Database, entityIds: readonly string[]): Promise<number | null> {
    if (entityIds.length === 0) return null;
    const row = await db.selectFrom('haState').select((eb) => eb.fn.min('at').as('at'))
        .where('entityId', 'in', entityIds).executeTakeFirst();
    return row?.at ?? null;
}

/**
 * Lists the state records of some entities in time order.
 *
 * @param db the database
 * @param entityIds the entities
 * @param since only records at or after this moment, null for all
 */
export async function listStates(db: Database, entityIds: readonly string[], since: number | null = null): Promise<StateRecord[]> {
    if (entityIds.length === 0) return [];
    let query = db.selectFrom('haState').select(['entityId', 'state', 'at']).where('entityId', 'in', entityIds);
    if (since !== null) query = query.where('at', '>=', since);
    return query.orderBy('at').orderBy('id').execute();
}

/**
 * Returns the latest valid state of an entity before a moment. The states unknown and unavailable are skipped.
 *
 * @param db the database
 * @param entityId the entity
 * @param before the moment
 */
export async function lastValidStateBefore(db: Database, entityId: string, before: number): Promise<StateRecord | undefined> {
    return db.selectFrom('haState').select(['entityId', 'state', 'at']).where('entityId', '=', entityId)
        .where('at', '<', before).where('state', 'not in', ['unknown', 'unavailable'])
        .orderBy('at', 'desc').orderBy('id', 'desc').executeTakeFirst();
}

/**
 * Returns the latest state of an entity.
 *
 * @param db the database
 * @param entityId the entity
 */
export async function latestState(db: Database, entityId: string): Promise<StateRecord | undefined> {
    return db.selectFrom('haState').select(['entityId', 'state', 'at']).where('entityId', '=', entityId)
        .orderBy('at', 'desc').orderBy('id', 'desc').executeTakeFirst();
}

/**
 * Returns the time of the last change of a person entity between home and away. The states unknown and unavailable
 * do not count as a change.
 *
 * @param db the database
 * @param entityId the person entity
 * @returns the time of the change, the first record when no change exists, or null without records
 */
export async function lastHomeChange(db: Database, entityId: string): Promise<number | null> {
    const valid = db.selectFrom('haState').select(['at', 'state']).where('entityId', '=', entityId)
        .where('state', 'not in', ['unknown', 'unavailable']);
    const current = await valid.orderBy('at', 'desc').orderBy('id', 'desc').executeTakeFirst();
    if (!current) return null;
    const home = current.state === 'home';
    const same = (q: typeof valid) => (home ? q.where('state', '=', 'home') : q.where('state', '!=', 'home'));
    const opposite = await (home ? valid.where('state', '!=', 'home') : valid.where('state', '=', 'home'))
        .orderBy('at', 'desc').orderBy('id', 'desc').executeTakeFirst();
    let query = same(valid);
    if (opposite) query = query.where('at', '>', opposite.at);
    const first = await query.orderBy('at').orderBy('id').executeTakeFirst();
    return first?.at ?? current.at;
}
