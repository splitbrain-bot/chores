import { describe, expect, it } from 'vitest';
import { HOUR } from '../../src/core/types.ts';
import { listTokens } from '../../src/db/tokens.ts';
import { createPerson } from '../../src/service/admin.ts';
import { authenticate, can, createToken, hashPassword, login, verifyPassword } from '../../src/service/auth.ts';
import { revokeToken } from '../../src/service/admin.ts';
import { Clock, makeDeps } from './helpers.ts';

describe('passwords', () => {
    it('hashes and verifies', async () => {
        const hash = await hashPassword('geheim');
        expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
        expect(await verifyPassword('geheim', hash)).toBe(true);
        expect(await verifyPassword('falsch', hash)).toBe(false);
        expect(await verifyPassword('x', 'broken')).toBe(false);
    });
});

describe('tokens', () => {
    it('logs in and authenticates the person token', async () => {
        const clock = new Clock('2026-10-26T20:00:00+01:00');
        const deps = await makeDeps(clock);
        await createPerson(deps, { name: 'Andi', haEntity: 'person.a', password: 'geheim' });
        await expect(login(deps, 'Andi', 'falsch')).rejects.toMatchObject({ status: 401 });
        await expect(login(deps, 'Nobody', 'geheim')).rejects.toMatchObject({ status: 401 });
        expect((await login(deps, 'andi', 'geheim')).person.name).toBe('Andi');
        expect((await login(deps, ' ANDI ', 'geheim')).person.name).toBe('Andi');
        await expect(createPerson(deps, { name: 'ANDI', haEntity: 'person.x' })).rejects.toMatchObject({ status: 409 });
        const { token, person } = await login(deps, 'Andi', 'geheim');
        const id = await authenticate(deps, token);
        expect(id).toMatchObject({ kind: 'person', person: { id: person.id }, viewer: { kind: 'person', personId: person.id } });
        expect(await authenticate(deps, 'wrong')).toBeNull();
    });

    it('updates the last use at most once per hour', async () => {
        const clock = new Clock('2026-10-26T20:00:00+01:00');
        const deps = await makeDeps(clock);
        const { plain } = await createToken(deps, 'shared', 'Tablet', null);
        await authenticate(deps, plain);
        const first = clock.t;
        clock.advance(HOUR - 1);
        await authenticate(deps, plain);
        expect((await listTokens(deps.db))[0]!.lastUsedAt).toBe(first);
        clock.advance(1);
        await authenticate(deps, plain);
        expect((await listTokens(deps.db))[0]!.lastUsedAt).toBe(clock.t);
    });

    it('rejects revoked tokens and invalid kinds', async () => {
        const clock = new Clock('2026-10-26T20:00:00+01:00');
        const deps = await makeDeps(clock);
        const p = await createPerson(deps, { name: 'Andi', haEntity: 'person.a' });
        const mcp = await createToken(deps, 'mcp', 'Claude Code', p.id);
        expect(await authenticate(deps, mcp.plain)).toMatchObject({ kind: 'mcp', viewer: { kind: 'person' } });
        const unbound = await createToken(deps, 'mcp', 'Claude Code', null);
        expect(await authenticate(deps, unbound.plain)).toMatchObject({ kind: 'mcp', viewer: { kind: 'shared' } });
        await revokeToken(deps, mcp.token.id);
        expect(await authenticate(deps, mcp.plain)).toBeNull();
        await expect(createToken(deps, 'person', 'x', null)).rejects.toMatchObject({ status: 400 });
        await expect(createToken(deps, 'shared', 'x', p.id)).rejects.toMatchObject({ status: 400 });
        await expect(createToken(deps, 'mcp', 'x', 99)).rejects.toMatchObject({ status: 400 });
    });

    it('gives the rights by kind', () => {
        expect(['person', 'shared', 'mcp'].map((k) => can(k as never, 'manage'))).toEqual([true, false, true]);
        expect(['person', 'shared', 'mcp'].map((k) => can(k as never, 'feedback'))).toEqual([true, true, true]);
        expect(can('shared', 'read')).toBe(true);
    });
});
