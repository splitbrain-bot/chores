import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HOUR, type Person, type Viewer } from '../core/types.ts';
import { countPersons, createPerson, getPerson, getPersonWithHash } from '../db/persons.ts';
import { createToken as insertToken, findActiveToken, touchToken, type Token } from '../db/tokens.ts';
import type { Deps } from './deps.ts';
import { ServiceError } from './errors.ts';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

/** Length of the scrypt hash in bytes. */
const KEY_LENGTH = 64;

/** Kind of a token. */
export type TokenKind = Token['kind'];

/** The identity behind a request. */
export interface Identity {
    tokenId: number;
    kind: TokenKind;
    person: Person | null;
    viewer: Viewer;
}

/** Actions with their own rights. */
export type Right = 'read' | 'feedback' | 'write';

/**
 * Hashes a password with a random salt.
 *
 * @param password the password
 * @returns salt and hash as hex, separated by a colon
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await scrypt(password, salt, KEY_LENGTH);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Checks a password against a stored hash.
 *
 * @param password the password
 * @param stored salt and hash as hex, separated by a colon
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Returns the sha256 hash of a token.
 *
 * @param plain the plain token
 */
export function hashToken(plain: string): string {
    return createHash('sha256').update(plain).digest('hex');
}

/**
 * Creates a token.
 *
 * @param deps the dependencies
 * @param kind the kind
 * @param label the label for the token list
 * @param personId the person, required for kind person and optional for kind mcp
 * @returns the token without hash and the plain token
 */
export async function createToken(deps: Deps, kind: TokenKind, label: string, personId: number | null):
    Promise<{ token: Token; plain: string }> {
    if (kind === 'person' && personId === null) throw new ServiceError(400, 'A person token needs a person');
    if (kind === 'shared' && personId !== null) throw new ServiceError(400, 'A shared token has no person');
    if (personId !== null && !(await getPerson(deps.db, personId))) throw new ServiceError(400, 'Unknown person');
    const plain = randomBytes(32).toString('base64url');
    const token = await insertToken(deps.db, { kind, personId, label, tokenHash: hashToken(plain), createdAt: deps.now() });
    return { token, plain };
}

/**
 * Checks a name and a password and creates a person token.
 *
 * @param deps the dependencies
 * @param name the name of the person
 * @param password the password
 * @param label the label of the token, for example the browser
 * @throws ServiceError 401 when the login fails
 */
export async function login(deps: Deps, name: string, password: string, label = 'Login'):
    Promise<{ token: string; person: Person }> {
    const found = await getPersonWithHash(deps.db, name);
    const ok = found?.passwordHash ? await verifyPassword(password, found.passwordHash) : false;
    if (!found || !ok) throw new ServiceError(401, 'Wrong name or password');
    const { plain } = await createToken(deps, 'person', label, found.person.id);
    return { token: plain, person: found.person };
}

/**
 * Finds the identity of a plain token and updates the last use at most once per hour.
 *
 * @param deps the dependencies
 * @param plain the plain token
 * @returns the identity, or null for an unknown or revoked token
 */
export async function authenticate(deps: Deps, plain: string): Promise<Identity | null> {
    const token = await findActiveToken(deps.db, hashToken(plain));
    if (!token) return null;
    const now = deps.now();
    if (token.lastUsedAt === null || now - token.lastUsedAt >= HOUR) await touchToken(deps.db, token.id, now);
    const person = token.personId !== null ? (await getPerson(deps.db, token.personId)) ?? null : null;
    if (token.kind === 'person' && !person) return null;
    const viewer: Viewer = person ? { kind: 'person', personId: person.id } : { kind: 'shared' };
    return { tokenId: token.id, kind: token.kind, person, viewer };
}

/**
 * Tells if a token kind has a right. Every token can read. The shared token can also give feedback. Person and MCP
 * tokens can do everything.
 *
 * @param kind the token kind
 * @param right the right
 */
export function can(kind: TokenKind, right: Right): boolean {
    if (right === 'read') return true;
    if (right === 'feedback') return true;
    return kind === 'person' || kind === 'mcp';
}

/**
 * Creates the first person when no person exists.
 *
 * @param deps the dependencies
 * @param name the name
 * @param password the password
 * @param haEntity the person entity in Home Assistant
 * @returns true when the person was created
 */
export async function ensureInitialPerson(deps: Deps, name: string, password: string, haEntity: string): Promise<boolean> {
    if ((await countPersons(deps.db)) > 0) return false;
    await createPerson(deps.db, { name, haEntity, passwordHash: await hashPassword(password) });
    return true;
}
