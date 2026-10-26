import { isValidState } from '../core/clock.ts';
import type { Person, PresenceState } from '../core/types.ts';
import { listChores } from '../db/chores.ts';
import type { Database } from '../db/database.ts';
import { lastHomeChange, lastValidStateBefore, latestState } from '../db/ha_state.ts';
import { listPersons } from '../db/persons.ts';
import type { WatchList } from '../ha/watcher.ts';
import type { Deps } from './deps.ts';

/** Presence of a person with the name. */
export interface PersonPresence extends PresenceState {
    name: string;
}

/**
 * Reads the presence of one person from the state log.
 *
 * @param db the database
 * @param person the person
 * @param now the current time
 */
export async function presenceOf(db: Database, person: Person, now: number): Promise<PresenceState> {
    const state = await lastValidStateBefore(db, person.haEntity, now + 1);
    let distanceKm: number | null = null;
    if (person.distanceEntity) {
        const d = await latestState(db, person.distanceEntity);
        const value = d && isValidState(d.state) ? Number.parseFloat(d.state) : Number.NaN;
        distanceKm = Number.isFinite(value) ? value : null;
    }
    return {
        personId: person.id,
        home: state?.state === 'home',
        since: await lastHomeChange(db, person.haEntity),
        distanceKm,
    };
}

/**
 * Returns the presence of every person.
 *
 * @param deps the dependencies
 */
export async function listPresence(deps: Deps): Promise<PersonPresence[]> {
    const now = deps.now();
    const result: PersonPresence[] = [];
    for (const person of await listPersons(deps.db)) {
        result.push({ ...(await presenceOf(deps.db, person, now)), name: person.name });
    }
    return result;
}

/**
 * Returns the entities that the watcher records: the person and distance entities of every person and the counter
 * entities of the active chores.
 *
 * @param db the database
 */
export async function watchList(db: Database): Promise<WatchList> {
    const persons = await listPersons(db);
    const chores = await listChores(db);
    const others = new Set<string>();
    for (const p of persons) if (p.distanceEntity) others.add(p.distanceEntity);
    for (const c of chores) if (c.growth === 'counter' && c.counterEntity) others.add(c.counterEntity);
    return { persons: persons.map((p) => p.haEntity), others: [...others] };
}
