import type { Category, Person, Settings } from '../core/types.ts';
import * as categories from '../db/categories.ts';
import * as persons from '../db/persons.ts';
import { getSettings as loadSettings, putSettings } from '../db/settings.ts';
import { listTokens as loadTokens, revokeToken as storeRevoke, type Token } from '../db/tokens.ts';
import { hashPassword } from './auth.ts';
import type { Deps } from './deps.ts';
import { notFound, ServiceError } from './errors.ts';

/** Values of a person as the API accepts them. */
export interface PersonInput {
    name: string;
    haEntity: string;
    distanceEntity?: string | null;
    calendarEntity?: string | null;
    notifyAction?: string | null;
    password?: string | null;
    sort?: number;
}

/**
 * Tells if an error is a violation of a unique constraint.
 *
 * @param err the error
 */
function isUniqueError(err: unknown): boolean {
    return err instanceof Error && 'code' in err && err.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/**
 * Checks that no other person has the same name without regard to case.
 *
 * @param deps the dependencies
 * @param name the new name
 * @param id the id of the changed person, null for a new person
 * @throws ServiceError 409 when the name exists already
 */
async function checkName(deps: Deps, name: string, id: number | null): Promise<void> {
    const others = (await persons.listPersons(deps.db)).filter((p) => p.id !== id);
    if (others.some((p) => persons.sameName(p.name, name))) throw new ServiceError(409, 'The name exists already');
}

/**
 * Converts person input to stored values.
 *
 * @param input the input
 */
async function personValues(input: Partial<PersonInput>): Promise<Partial<persons.NewPerson>> {
    const { password, ...rest } = input;
    const values: Partial<persons.NewPerson> = { ...rest };
    if (password !== undefined) values.passwordHash = password ? await hashPassword(password) : null;
    return values;
}

/**
 * Lists the persons.
 *
 * @param deps the dependencies
 */
export function listPersons(deps: Deps): Promise<Person[]> {
    return persons.listPersons(deps.db);
}

/**
 * Creates a person.
 *
 * @param deps the dependencies
 * @param input the values
 */
export async function createPerson(deps: Deps, input: PersonInput): Promise<Person> {
    await checkName(deps, input.name, null);
    try {
        const person = await persons.createPerson(deps.db, (await personValues(input)) as persons.NewPerson);
        deps.onPersonsChanged?.();
        return person;
    } catch (err) {
        if (isUniqueError(err)) throw new ServiceError(409, 'The name exists already');
        throw err;
    }
}

/**
 * Changes a person.
 *
 * @param deps the dependencies
 * @param id the person id
 * @param input the changed values
 */
export async function updatePerson(deps: Deps, id: number, input: Partial<PersonInput>): Promise<Person> {
    if (input.name !== undefined) await checkName(deps, input.name, id);
    try {
        const person = await persons.updatePerson(deps.db, id, await personValues(input));
        if (!person) throw notFound('Person');
        deps.onPersonsChanged?.();
        return person;
    } catch (err) {
        if (isUniqueError(err)) throw new ServiceError(409, 'The name exists already');
        throw err;
    }
}

/**
 * Lists the categories.
 *
 * @param deps the dependencies
 */
export function listCategories(deps: Deps): Promise<Category[]> {
    return categories.listCategories(deps.db);
}

/**
 * Creates a category.
 *
 * @param deps the dependencies
 * @param name the name
 * @param sort the sort position
 */
export async function createCategory(deps: Deps, name: string, sort = 0): Promise<Category> {
    try {
        return await categories.createCategory(deps.db, name, sort);
    } catch (err) {
        if (isUniqueError(err)) throw new ServiceError(409, 'The name exists already');
        throw err;
    }
}

/**
 * Changes a category.
 *
 * @param deps the dependencies
 * @param id the category id
 * @param values the changed values
 */
export async function updateCategory(deps: Deps, id: number, values: { name?: string; sort?: number }): Promise<Category> {
    try {
        const category = await categories.updateCategory(deps.db, id, values);
        if (!category) throw notFound('Category');
        return category;
    } catch (err) {
        if (isUniqueError(err)) throw new ServiceError(409, 'The name exists already');
        throw err;
    }
}

/**
 * Deletes a category. The chores stay.
 *
 * @param deps the dependencies
 * @param id the category id
 */
export async function deleteCategory(deps: Deps, id: number): Promise<void> {
    if (!(await categories.deleteCategory(deps.db, id))) throw notFound('Category');
}

/**
 * Returns the settings.
 *
 * @param deps the dependencies
 */
export function getSettings(deps: Deps): Promise<Settings> {
    return loadSettings(deps.db);
}

/**
 * Stores the settings.
 *
 * @param deps the dependencies
 * @param settings the validated settings
 */
export async function setSettings(deps: Deps, settings: Settings): Promise<Settings> {
    await putSettings(deps.db, settings);
    return loadSettings(deps.db);
}

/**
 * Lists the tokens.
 *
 * @param deps the dependencies
 */
export function listTokens(deps: Deps): Promise<Token[]> {
    return loadTokens(deps.db);
}

/**
 * Revokes a token.
 *
 * @param deps the dependencies
 * @param id the token id
 */
export async function revokeToken(deps: Deps, id: number): Promise<void> {
    if (!(await storeRevoke(deps.db, id, deps.now()))) throw notFound('Token');
}
