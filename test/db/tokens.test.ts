import { describe, expect, it } from 'vitest';
import { createPerson } from '../../src/db/persons.ts';
import { createToken, findActiveToken, listTokens, revokeToken, touchToken } from '../../src/db/tokens.ts';
import { memoryDb } from './helpers.ts';

describe('tokens', () => {
    it('creates, finds, touches, lists and revokes tokens', async () => {
        const db = await memoryDb();
        const p = await createPerson(db, { name: 'Andi', haEntity: 'person.a' });
        const t = await createToken(db, { kind: 'person', personId: p.id, label: 'Pixel', tokenHash: 'h1', createdAt: 1 });
        await createToken(db, { kind: 'shared', personId: null, label: 'Tablet', tokenHash: 'h2', createdAt: 2 });
        expect(t).not.toHaveProperty('tokenHash');
        expect(await findActiveToken(db, 'h1')).toMatchObject({ id: t.id, kind: 'person', personId: p.id });
        await touchToken(db, t.id, 50);
        expect((await listTokens(db)).map((x) => [x.label, x.lastUsedAt])).toEqual([['Tablet', null], ['Pixel', 50]]);
        expect(await revokeToken(db, t.id, 60)).toBe(true);
        expect(await revokeToken(db, t.id, 70)).toBe(false);
        expect(await findActiveToken(db, 'h1')).toBeUndefined();
    });
});
