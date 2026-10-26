import { createDatabase, type Database } from '../../src/db/database.ts';

/**
 * Creates a migrated database in memory.
 */
export function memoryDb(): Promise<Database> {
    return createDatabase(':memory:');
}
