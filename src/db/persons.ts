import type { Person } from '../core/types.ts';
import type { Database } from './database.ts';
import type { PersonRow } from './types.ts';

/** Values of a new person. */
export interface NewPerson {
    name: string;
    haEntity?: string | null;
    distanceEntity?: string | null;
    calendarEntity?: string | null;
    notifyAction?: string | null;
    passwordHash?: string | null;
    sort?: number;
    color?: string;
}

/**
 * Converts a row to a person without the password hash.
 *
 * @param row the row
 */
function toPerson(row: PersonRow): Person {
    return {
        id: row.id, name: row.name, haEntity: row.haEntity, distanceEntity: row.haDistanceEntity,
        calendarEntity: row.haCalendarEntity, notifyAction: row.haNotifyAction, sort: row.sort, color: row.color,
    };
}

/**
 * Lists all persons sorted by sort and name.
 *
 * @param db the database
 */
export async function listPersons(db: Database): Promise<Person[]> {
    const rows = await db.selectFrom('person').selectAll().orderBy('sort').orderBy('name').execute();
    return rows.map(toPerson);
}

/**
 * Returns one person.
 *
 * @param db the database
 * @param id the person id
 */
export async function getPerson(db: Database, id: number): Promise<Person | undefined> {
    const row = await db.selectFrom('person').selectAll().where('id', '=', id).executeTakeFirst();
    return row && toPerson(row);
}

/**
 * Returns a person with the password hash for the login. The name is compared without regard to case.
 *
 * @param db the database
 * @param name the name of the person
 */
export async function getPersonWithHash(db: Database, name: string): Promise<{ person: Person; passwordHash: string | null } | undefined> {
    const row = (await db.selectFrom('person').selectAll().execute()).find((r) => sameName(r.name, name));
    return row && { person: toPerson(row), passwordHash: row.passwordHash };
}

/**
 * Tells if two person names are the same without regard to case.
 *
 * @param a the first name
 * @param b the second name
 */
export function sameName(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Counts the persons.
 *
 * @param db the database
 */
export async function countPersons(db: Database): Promise<number> {
    const row = await db.selectFrom('person').select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirstOrThrow();
    return Number(row.n);
}

/**
 * Creates a person.
 *
 * @param db the database
 * @param p the values
 */
export async function createPerson(db: Database, p: NewPerson): Promise<Person> {
    const row = await db.insertInto('person').values({
        name: p.name, haEntity: p.haEntity ?? null, haDistanceEntity: p.distanceEntity ?? null,
        haCalendarEntity: p.calendarEntity ?? null, haNotifyAction: p.notifyAction ?? null,
        passwordHash: p.passwordHash ?? null, sort: p.sort ?? 0, color: p.color,
    }).returningAll().executeTakeFirstOrThrow();
    return toPerson(row);
}

/**
 * Changes a person.
 *
 * @param db the database
 * @param id the person id
 * @param p the changed values
 * @returns the person, or undefined when it does not exist
 */
export async function updatePerson(db: Database, id: number, p: Partial<NewPerson>): Promise<Person | undefined> {
    const values = {
        name: p.name, haEntity: p.haEntity, haDistanceEntity: p.distanceEntity, haCalendarEntity: p.calendarEntity,
        haNotifyAction: p.notifyAction, passwordHash: p.passwordHash, sort: p.sort, color: p.color,
    };
    const set = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
    if (Object.keys(set).length > 0) await db.updateTable('person').set(set).where('id', '=', id).execute();
    return getPerson(db, id);
}
