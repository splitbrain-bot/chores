import type { Category } from '../core/types.ts';
import type { Database } from './database.ts';

/**
 * Lists all categories sorted by sort and name.
 *
 * @param db the database
 */
export async function listCategories(db: Database): Promise<Category[]> {
    return db.selectFrom('category').selectAll().orderBy('sort').orderBy('name').execute();
}

/**
 * Returns one category.
 *
 * @param db the database
 * @param id the category id
 */
export async function getCategory(db: Database, id: number): Promise<Category | undefined> {
    return db.selectFrom('category').selectAll().where('id', '=', id).executeTakeFirst();
}

/**
 * Creates a category.
 *
 * @param db the database
 * @param name the unique name
 * @param sort the sort position
 */
export async function createCategory(db: Database, name: string, sort = 0): Promise<Category> {
    return db.insertInto('category').values({ name, sort }).returningAll().executeTakeFirstOrThrow();
}

/**
 * Changes a category.
 *
 * @param db the database
 * @param id the category id
 * @param values the changed values
 * @returns the category, or undefined when it does not exist
 */
export async function updateCategory(db: Database, id: number, values: { name?: string; sort?: number }): Promise<Category | undefined> {
    if (values.name !== undefined || values.sort !== undefined) {
        await db.updateTable('category').set(values).where('id', '=', id).execute();
    }
    return getCategory(db, id);
}

/**
 * Deletes a category. The links to the chores go away with it.
 *
 * @param db the database
 * @param id the category id
 * @returns true when the category existed
 */
export async function deleteCategory(db: Database, id: number): Promise<boolean> {
    const result = await db.deleteFrom('category').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
}
