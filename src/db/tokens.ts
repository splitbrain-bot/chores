import type { Database } from './database.ts';
import type { TokenRow } from './types.ts';

/** A token without its hash. */
export type Token = Omit<TokenRow, 'tokenHash'>;

/** Values of a new token. */
export interface NewToken {
    kind: 'person' | 'shared' | 'mcp';
    personId: number | null;
    label: string;
    tokenHash: string;
    createdAt: number;
}

/**
 * Creates a token.
 *
 * @param db the database
 * @param token the values
 */
export async function createToken(db: Database, token: NewToken): Promise<Token> {
    const { tokenHash: _hash, ...row } = await db.insertInto('token').values(token).returningAll()
        .executeTakeFirstOrThrow();
    return row;
}

/**
 * Returns the active token with a hash.
 *
 * @param db the database
 * @param tokenHash the sha256 hash
 */
export async function findActiveToken(db: Database, tokenHash: string): Promise<Token | undefined> {
    return db.selectFrom('token').select(['id', 'kind', 'personId', 'label', 'createdAt', 'lastUsedAt', 'revokedAt'])
        .where('tokenHash', '=', tokenHash).where('revokedAt', 'is', null).executeTakeFirst();
}

/**
 * Sets the time of the last use.
 *
 * @param db the database
 * @param id the token id
 * @param at the time of the use
 */
export async function touchToken(db: Database, id: number, at: number): Promise<void> {
    await db.updateTable('token').set({ lastUsedAt: at }).where('id', '=', id).execute();
}

/**
 * Lists all tokens, newest first.
 *
 * @param db the database
 */
export async function listTokens(db: Database): Promise<Token[]> {
    return db.selectFrom('token').select(['id', 'kind', 'personId', 'label', 'createdAt', 'lastUsedAt', 'revokedAt'])
        .orderBy('createdAt', 'desc').orderBy('id', 'desc').execute();
}

/**
 * Revokes a token.
 *
 * @param db the database
 * @param id the token id
 * @param at the time of the revoke
 * @returns true when an active token was revoked
 */
export async function revokeToken(db: Database, id: number, at: number): Promise<boolean> {
    const result = await db.updateTable('token').set({ revokedAt: at }).where('id', '=', id)
        .where('revokedAt', 'is', null).executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
}
