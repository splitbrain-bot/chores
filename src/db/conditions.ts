import type { Condition, ConditionKind } from '../core/types.ts';
import type { Database } from './database.ts';

/**
 * Lists all conditions sorted by name.
 *
 * @param db the database
 */
export async function listConditions(db: Database): Promise<Condition[]> {
    return db.selectFrom('condition').selectAll().orderBy('name').execute();
}

/**
 * Returns one condition.
 *
 * @param db the database
 * @param id the condition id
 */
export async function getCondition(db: Database, id: number): Promise<Condition | undefined> {
    return db.selectFrom('condition').selectAll().where('id', '=', id).executeTakeFirst();
}

/**
 * Creates a condition without a result.
 *
 * @param db the database
 * @param values the unique name, the kind and the template
 */
export async function createCondition(db: Database, values: { name: string; kind: ConditionKind; template: string }):
    Promise<Condition> {
    return db.insertInto('condition').values(values).returningAll().executeTakeFirstOrThrow();
}

/**
 * Changes a condition. A changed template clears the last result and error.
 *
 * @param db the database
 * @param id the condition id
 * @param values the changed values
 * @returns the condition, or undefined when it does not exist
 */
export async function updateCondition(db: Database, id: number, values: { name?: string; template?: string }):
    Promise<Condition | undefined> {
    const current = await getCondition(db, id);
    if (!current) return undefined;
    const update: Partial<Condition> = {};
    if (values.name !== undefined) update.name = values.name;
    if (values.template !== undefined && values.template !== current.template) {
        Object.assign(update, { template: values.template, result: null, error: null });
    }
    if (Object.keys(update).length > 0) await db.updateTable('condition').set(update).where('id', '=', id).execute();
    return getCondition(db, id);
}

/**
 * Deletes a condition. Deleted chores lose their link to it.
 *
 * @param db the database
 * @param id the condition id
 * @returns true when the condition existed
 */
export async function deleteCondition(db: Database, id: number): Promise<boolean> {
    for (const column of ['conditionId', 'boostId', 'forecastId'] as const) {
        await db.updateTable('chore').set({ [column]: null }).where(column, '=', id).where('deletedAt', 'is not', null)
            .execute();
    }
    const result = await db.deleteFrom('condition').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
}

/**
 * Stores the result of a template subscription.
 *
 * @param db the database
 * @param id the condition id
 * @param result 1, 0 or null for a render error
 * @param error the error text of a render error
 */
export async function setConditionResult(db: Database, id: number, result: number | null, error: string | null):
    Promise<void> {
    await db.updateTable('condition').set({ result, error }).where('id', '=', id).execute();
}

/**
 * Returns the ids of the active chores that use each condition.
 *
 * @param db the database
 * @returns the chore ids per condition id
 */
export async function conditionUses(db: Database): Promise<Map<number, number[]>> {
    const rows = await db.selectFrom('chore').select(['id', 'conditionId', 'boostId', 'forecastId'])
        .where('deletedAt', 'is', null).orderBy('id').execute();
    const uses = new Map<number, number[]>();
    for (const row of rows) {
        for (const conditionId of new Set([row.conditionId, row.boostId, row.forecastId])) {
            if (conditionId === null) continue;
            uses.set(conditionId, [...(uses.get(conditionId) ?? []), row.id]);
        }
    }
    return uses;
}
