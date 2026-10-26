import { DEFAULT_SETTINGS, type Settings } from '../core/types.ts';
import type { Database } from './database.ts';

/**
 * Returns all settings. Missing keys have their default value.
 *
 * @param db the database
 */
export async function getSettings(db: Database): Promise<Settings> {
    const rows = await db.selectFrom('setting').selectAll().execute();
    const stored = Object.fromEntries(rows.filter((r) => r.key in DEFAULT_SETTINGS).map((r) => [r.key, JSON.parse(r.value)]));
    return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * Stores settings.
 *
 * @param db the database
 * @param values the settings to store
 */
export async function putSettings(db: Database, values: Partial<Settings>): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined) continue;
        await db.insertInto('setting').values({ key, value: JSON.stringify(value) })
            .onConflict((oc) => oc.column('key').doUpdateSet({ value: JSON.stringify(value) })).execute();
    }
}
