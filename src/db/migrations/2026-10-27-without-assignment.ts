import { sql, type Kysely } from 'kysely';

/**
 * Removes the assignment of the chores. The number of linked persons now gives the rule: no person means any
 * person, one person means only this person, and more persons must do the chore together. A chore that one of many
 * persons could do loses its persons, and a chore that all persons had to do together gets all persons.
 *
 * @param db the database
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`DELETE FROM chore_person WHERE chore_id IN (
        SELECT c.id FROM chore c WHERE c.assignment = 'any'
        AND (SELECT COUNT(*) FROM chore_person cp WHERE cp.chore_id = c.id) > 1)`.execute(db);
    await sql`INSERT INTO chore_person (chore_id, person_id)
        SELECT c.id, p.id FROM chore c, person p WHERE c.assignment = 'all'
        AND NOT EXISTS (SELECT 1 FROM chore_person cp WHERE cp.chore_id = c.id)`.execute(db);
    await sql`ALTER TABLE chore DROP COLUMN assignment`.execute(db);
}

/**
 * Adds the assignment again. A chore with more than one person gets the assignment all, every other chore any.
 *
 * @param db the database
 */
export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE chore ADD COLUMN assignment TEXT NOT NULL DEFAULT 'any' CHECK (assignment IN ('any', 'all'))`
        .execute(db);
    await sql`UPDATE chore SET assignment = 'all'
        WHERE (SELECT COUNT(*) FROM chore_person cp WHERE cp.chore_id = chore.id) > 1`.execute(db);
}
