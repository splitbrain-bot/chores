import type { Condition } from '../core/types.ts';
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
 * @param values the unique name, the templates and the icon
 */
export async function createCondition(db: Database,
    values: { name: string; template: string; forecastTemplate?: string | null; icon?: string | null }):
    Promise<Condition> {
    return db.insertInto('condition').values(values).returningAll().executeTakeFirstOrThrow();
}

/**
 * Changes a condition. A changed template clears the last result, the error and the time since the result is true.
 *
 * @param db the database
 * @param id the condition id
 * @param values the changed values
 * @returns the condition, or undefined when it does not exist
 */
export async function updateCondition(db: Database, id: number,
    values: { name?: string; template?: string; forecastTemplate?: string | null; icon?: string | null }):
    Promise<Condition | undefined> {
    const current = await getCondition(db, id);
    if (!current) return undefined;
    const update: Partial<Condition> = {};
    if (values.name !== undefined) update.name = values.name;
    if (values.icon !== undefined) update.icon = values.icon;
    if (values.forecastTemplate !== undefined) update.forecastTemplate = values.forecastTemplate;
    if (values.template !== undefined && values.template !== current.template) {
        Object.assign(update, { template: values.template, result: null, error: null, sinceAt: null });
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
    for (const column of ['requiresId', 'triggerId'] as const) {
        await db.updateTable('chore').set({ [column]: null }).where(column, '=', id).where('deletedAt', 'is not', null)
            .execute();
    }
    const result = await db.deleteFrom('condition').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
}

/**
 * Stores the result of a template subscription. A change of the result from 0 to 1 and the first result 1 of a
 * new template set the time since the result is true. A change from an error to 1 keeps it.
 *
 * @param db the database
 * @param id the condition id
 * @param result 1, 0 or null for a render error
 * @param error the error text of a render error
 * @param at the time of the result
 */
export async function setConditionResult(db: Database, id: number, result: number | null, error: string | null,
    at: number): Promise<void> {
    const current = await getCondition(db, id);
    if (!current) return;
    const fresh = current.result === null && current.error === null && current.sinceAt === null;
    const edge = result === 1 && (current.result === 0 || fresh);
    await db.updateTable('condition').set(edge ? { result, error, sinceAt: at } : { result, error })
        .where('id', '=', id).execute();
}

/**
 * Returns the ids of the active chores that use each condition.
 *
 * @param db the database
 * @returns the chore ids per condition id
 */
export async function conditionUses(db: Database): Promise<Map<number, number[]>> {
    const rows = await db.selectFrom('chore').select(['id', 'requiresId', 'triggerId'])
        .where('deletedAt', 'is', null).orderBy('id').execute();
    const uses = new Map<number, number[]>();
    for (const row of rows) {
        for (const conditionId of new Set([row.requiresId, row.triggerId])) {
            if (conditionId === null) continue;
            uses.set(conditionId, [...(uses.get(conditionId) ?? []), row.id]);
        }
    }
    return uses;
}
