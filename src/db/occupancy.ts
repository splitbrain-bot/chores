import type { OccupancyRow } from '../core/types.ts';
import type { Database } from './database.ts';

/**
 * Lists all occupancy rows sorted by start.
 *
 * @param db the database
 */
export async function listOccupancy(db: Database): Promise<OccupancyRow[]> {
    return db.selectFrom('occupancy').select(['startAt', 'endAt', 'clockStart']).orderBy('startAt').execute();
}

/**
 * Returns the open occupancy row.
 *
 * @param db the database
 */
export async function openOccupancy(db: Database): Promise<OccupancyRow | undefined> {
    return db.selectFrom('occupancy').select(['startAt', 'endAt', 'clockStart']).where('endAt', 'is', null)
        .orderBy('startAt', 'desc').executeTakeFirst();
}

/**
 * Inserts an occupancy row.
 *
 * @param db the database
 * @param row the row
 */
export async function insertOccupancy(db: Database, row: OccupancyRow): Promise<void> {
    await db.insertInto('occupancy').values(row).execute();
}

/**
 * Closes the open occupancy row.
 *
 * @param db the database
 * @param endAt the end of the period
 */
export async function closeOccupancy(db: Database, endAt: number): Promise<void> {
    await db.updateTable('occupancy').set({ endAt }).where('endAt', 'is', null).execute();
}

/**
 * Replaces all occupancy rows.
 *
 * @param db the database
 * @param rows the new rows
 */
export async function replaceOccupancy(db: Database, rows: readonly OccupancyRow[]): Promise<void> {
    await db.deleteFrom('occupancy').execute();
    for (let i = 0; i < rows.length; i += 500) {
        await db.insertInto('occupancy').values(rows.slice(i, i + 500).map((r) => ({ ...r }))).execute();
    }
}
