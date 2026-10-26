import { sql } from 'kysely';
import type { Database } from './database.ts';

/** A cached value with the time of the fetch. */
export interface Cached<T> {
    value: T;
    fetchedAt: number;
}

/**
 * Returns a cached value.
 *
 * @param db the database
 * @param key the cache key, for example forecast:daily
 */
export async function getCache<T>(db: Database, key: string): Promise<Cached<T> | undefined> {
    const row = await db.selectFrom('cache').selectAll().where('key', '=', key).executeTakeFirst();
    return row && { value: JSON.parse(row.value) as T, fetchedAt: row.fetchedAt };
}

/**
 * Lists the cached values with a key prefix.
 *
 * @param db the database
 * @param prefix the key prefix
 */
export async function listCache<T>(db: Database, prefix: string): Promise<Map<string, Cached<T>>> {
    const rows = await db.selectFrom('cache').selectAll().where(hasPrefix(prefix)).execute();
    return new Map(rows.map((r) => [r.key, { value: JSON.parse(r.value) as T, fetchedAt: r.fetchedAt }]));
}

/**
 * Stores a value.
 *
 * @param db the database
 * @param key the cache key
 * @param value the value, stored as JSON
 * @param fetchedAt the time of the fetch
 */
export async function setCache(db: Database, key: string, value: unknown, fetchedAt: number): Promise<void> {
    const json = JSON.stringify(value);
    await db.insertInto('cache').values({ key, value: json, fetchedAt })
        .onConflict((oc) => oc.column('key').doUpdateSet({ value: json, fetchedAt })).execute();
}

/**
 * Deletes the cached values with a key prefix.
 *
 * @param db the database
 * @param prefix the key prefix
 */
export async function deleteCache(db: Database, prefix: string): Promise<void> {
    await db.deleteFrom('cache').where(hasPrefix(prefix)).execute();
}

/**
 * Builds a condition for keys that start with a prefix.
 *
 * @param prefix the prefix
 */
function hasPrefix(prefix: string) {
    return sql<boolean>`substr(key, 1, ${prefix.length}) = ${prefix}`;
}
