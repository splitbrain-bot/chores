import type { Chore } from '../core/types.ts';
import type { Database } from './database.ts';
import type { ChoreRow, ChoreRowUpdate, NewChoreRow } from './types.ts';

/** Values of a new chore. */
export type NewChore = Omit<Chore, 'id'>;

/** Filter for the chore list. */
export interface ChoreFilter {
    includeDeleted?: boolean;
    ids?: number[];
}

/**
 * Converts a row and its links to a chore.
 *
 * @param row the row
 * @param personIds the linked persons
 * @param categoryIds the linked categories
 */
function toChore(row: ChoreRow, personIds: number[], categoryIds: number[]): Chore {
    return {
        ...row,
        learnDirection: Math.sign(row.learnDirection) as -1 | 0 | 1,
        noisy: row.noisy === 1,
        personIds,
        categoryIds,
    };
}

/**
 * Converts chore values to row values. The links are not part of the row.
 *
 * @param values the chore values
 */
function toRow(values: Partial<Chore>): ChoreRowUpdate {
    const { id: _id, personIds: _p, categoryIds: _c, noisy, ...rest } = values;
    const row: ChoreRowUpdate = { ...rest };
    if (noisy !== undefined) row.noisy = noisy ? 1 : 0;
    return row;
}

/**
 * Lists chores with their links, sorted by name.
 *
 * @param db the database
 * @param filter the filter
 */
export async function listChores(db: Database, filter: ChoreFilter = {}): Promise<Chore[]> {
    let query = db.selectFrom('chore').selectAll().orderBy('name').orderBy('id');
    if (!filter.includeDeleted) query = query.where('deletedAt', 'is', null);
    if (filter.ids) {
        if (filter.ids.length === 0) return [];
        query = query.where('id', 'in', filter.ids);
    }
    const rows = await query.execute();
    if (rows.length === 0) return [];

    const persons = await db.selectFrom('chorePerson').selectAll().execute();
    const categories = await db.selectFrom('choreCategory').selectAll().execute();
    const personMap = group(persons.map((r) => [r.choreId, r.personId]));
    const categoryMap = group(categories.map((r) => [r.choreId, r.categoryId]));
    return rows.map((r) => toChore(r, personMap.get(r.id) ?? [], categoryMap.get(r.id) ?? []));
}

/**
 * Returns one chore with its links, also a deleted one.
 *
 * @param db the database
 * @param id the chore id
 */
export async function getChore(db: Database, id: number): Promise<Chore | undefined> {
    const row = await db.selectFrom('chore').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) return undefined;
    const persons = await db.selectFrom('chorePerson').select('personId').where('choreId', '=', id).execute();
    const categories = await db.selectFrom('choreCategory').select('categoryId').where('choreId', '=', id).execute();
    return toChore(row, persons.map((r) => r.personId).sort((a, b) => a - b),
        categories.map((r) => r.categoryId).sort((a, b) => a - b));
}

/**
 * Creates a chore with its links.
 *
 * @param db the database
 * @param values the chore values
 */
export async function createChore(db: Database, values: NewChore): Promise<Chore> {
    const row = toRow(values) as NewChoreRow;
    const { id } = await db.insertInto('chore').values(row).returning('id').executeTakeFirstOrThrow();
    await setLinks(db, id, values.personIds, values.categoryIds);
    return (await getChore(db, id))!;
}

/**
 * Changes a chore. Links are replaced when the values contain them.
 *
 * @param db the database
 * @param id the chore id
 * @param values the changed values
 * @returns the chore, or undefined when it does not exist
 */
export async function updateChore(db: Database, id: number, values: Partial<Chore>): Promise<Chore | undefined> {
    const row = toRow(values);
    if (Object.keys(row).length > 0) await db.updateTable('chore').set(row).where('id', '=', id).execute();
    await setLinks(db, id, values.personIds, values.categoryIds);
    return getChore(db, id);
}

/**
 * Replaces the person and category links of a chore.
 *
 * @param db the database
 * @param id the chore id
 * @param personIds new person links, undefined to keep them
 * @param categoryIds new category links, undefined to keep them
 */
async function setLinks(db: Database, id: number, personIds?: number[], categoryIds?: number[]): Promise<void> {
    if (personIds) {
        await db.deleteFrom('chorePerson').where('choreId', '=', id).execute();
        if (personIds.length > 0) {
            await db.insertInto('chorePerson').values(personIds.map((personId) => ({ choreId: id, personId }))).execute();
        }
    }
    if (categoryIds) {
        await db.deleteFrom('choreCategory').where('choreId', '=', id).execute();
        if (categoryIds.length > 0) {
            await db.insertInto('choreCategory').values(categoryIds.map((categoryId) => ({ choreId: id, categoryId })))
                .execute();
        }
    }
}

/**
 * Stores the result of a template subscription.
 *
 * @param db the database
 * @param id the chore id
 * @param which the template
 * @param result 1, 0 or null for a render error
 * @param error the error text of a render error
 */
export async function setTemplateResult(db: Database, id: number, which: 'condition' | 'boost', result: number | null,
    error: string | null): Promise<void> {
    const column = which === 'condition' ? 'conditionResult' : 'boostResult';
    await db.updateTable('chore').set({ [column]: result, templateError: error }).where('id', '=', id).execute();
}

/**
 * Groups pairs by their first value.
 *
 * @param pairs key and value pairs
 */
function group(pairs: [number, number][]): Map<number, number[]> {
    const map = new Map<number, number[]>();
    for (const [k, v] of pairs) {
        const list = map.get(k) ?? [];
        list.push(v);
        map.set(k, list);
    }
    for (const list of map.values()) list.sort((a, b) => a - b);
    return map;
}
