import { beforeEach, describe, expect, it } from 'vitest';
import { DAY } from '../../src/core/types.ts';
import { DEFAULT_SETTINGS } from '../../src/core/types.ts';
import { testApp, type TestApp } from './helpers.ts';

const chore = { name: 'Boden', kind: 'recurring', growth: 'time', interval: 7, importance: 'normal', durationMin: 15,
    effort: 2, assignment: 'any' };

describe('HTTP API', () => {
    let t: TestApp;

    beforeEach(async () => {
        t = await testApp();
    });

    it('answers the health check without a token and sets the CSP header', async () => {
        const res = await t.call('GET', '/api/health', null);
        expect(await res.json()).toEqual({ ok: true, haConnected: true, lastEventAt: 5, version: 'test' });
        expect(res.headers.get('content-security-policy'))
            .toBe("frame-ancestors 'self' https://ha.example.org http://192.168.1.10:8123");
        expect(res.headers.get('x-frame-options')).toBeNull();
    });

    it('logs in, limits the attempts and returns the identity', async () => {
        const ok = await t.call('POST', '/api/auth/login', null, { name: 'Andi', password: 'geheim' });
        expect(ok.status).toBe(200);
        const { token, person } = await ok.json() as { token: string; person: { name: string } };
        expect(person.name).toBe('Andi');
        expect(await (await t.call('GET', '/api/auth/me', token)).json()).toMatchObject({ kind: 'person', person: { name: 'Andi' } });
        expect(await (await t.call('GET', '/api/auth/me', t.shared)).json()).toEqual({ kind: 'shared' });
        expect((await t.call('POST', '/api/auth/login', null, { name: 'Andi', password: 'x' })).status).toBe(401);
        expect((await t.call('POST', '/api/auth/login', null, { name: 'Andi' })).status).toBe(400);
        for (let i = 0; i < 2; i++) await t.call('POST', '/api/auth/login', null, { name: 'Andi', password: 'x' });
        expect((await t.call('POST', '/api/auth/login', null, { name: 'Andi', password: 'geheim' })).status).toBe(429);
    });

    it('requires a token', async () => {
        expect((await t.call('GET', '/api/chores', null)).status).toBe(401);
        expect((await t.call('GET', '/api/chores', 'wrong')).status).toBe(401);
        expect(await (await t.call('GET', '/api/chores', null)).json()).toEqual({ error: 'Missing or invalid token' });
    });

    it('manages conditions', async () => {
        const created = await t.call('POST', '/api/conditions', t.person, { name: 'Trocken', kind: 'state', template: '{{ a }}' });
        expect(created.status).toBe(201);
        const { condition } = await created.json() as { condition: { id: number } };
        expect((await t.call('POST', '/api/conditions', t.person, { name: 'x', kind: 'other', template: '{{ a }}' })).status)
            .toBe(400);
        expect((await t.call('POST', '/api/conditions', t.shared, { name: 'x', kind: 'state', template: '{{ a }}' })).status)
            .toBe(403);
        await t.call('POST', '/api/chores', t.person, { ...chore, conditionId: condition.id });

        expect(await (await t.call('GET', '/api/conditions', t.shared)).json()).toMatchObject({
            conditions: [{ id: condition.id, name: 'Trocken', choreIds: [1] }] });
        expect(await (await t.call('PATCH', `/api/conditions/${condition.id}`, t.person, { name: 'Draußen trocken' })).json())
            .toMatchObject({ condition: { name: 'Draußen trocken' } });
        expect((await t.call('DELETE', `/api/conditions/${condition.id}`)).status).toBe(409);
        await t.call('DELETE', '/api/chores/1');
        expect((await t.call('DELETE', `/api/conditions/${condition.id}`)).status).toBe(200);
    });

    it('manages chores and gives feedback', async () => {
        const created = await t.call('POST', '/api/chores', t.person, { ...chore, lastDoneAt: t.clock.t - 10 * DAY });
        expect(created.status).toBe(201);
        const { chore: c } = await created.json() as { chore: { id: number } };
        expect((await t.call('POST', '/api/chores', t.person, { ...chore, effort: 9 })).status).toBe(400);

        const list = await (await t.call('GET', '/api/chores?q=bod&kind=recurring')).json() as { chores: unknown[] };
        expect(list.chores).toHaveLength(1);
        expect(await (await t.call('GET', `/api/chores/${c.id}`)).json()).toMatchObject({ chore: { id: c.id }, events: [] });
        expect((await t.call('GET', '/api/chores/999')).status).toBe(404);
        expect((await t.call('GET', '/api/chores/abc')).status).toBe(404);

        const patched = await (await t.call('PATCH', `/api/chores/${c.id}`, t.person, { durationMin: 20 })).json();
        expect(patched).toMatchObject({ chore: { durationMin: 20 } });

        const suggestions = await (await t.call('GET', '/api/suggestions', t.shared)).json() as {
            suggestions: unknown[]; capacity: unknown; presence: unknown[]; hints: unknown[] };
        expect(suggestions).toHaveProperty('capacity');
        expect(suggestions.presence).toHaveLength(1);

        const done = await (await t.call('POST', `/api/chores/${c.id}/done`, t.shared, {})).json() as {
            events: { choreId: number; eventId: number }[] };
        expect(done.events).toEqual([{ choreId: c.id, eventId: expect.any(Number), earlier: true }]);
        const earlier = await t.call('POST', `/api/events/${done.events[0]!.eventId}/earlier`, t.shared);
        expect(await earlier.json()).toMatchObject({ chore: { interval: 5.95 } });
        expect((await t.call('POST', `/api/events/${done.events[0]!.eventId}/earlier`, t.shared)).status).toBe(409);

        const postponed = await t.call('POST', `/api/chores/${c.id}/postpone`, t.shared, { reason: 'no_energy' });
        expect(await postponed.json()).toMatchObject({ chore: { blockedBy: expect.arrayContaining(['snoozed']) } });
        expect((await t.call('POST', `/api/chores/${c.id}/postpone`, t.shared, { reason: 'bored' })).status).toBe(400);

        expect((await t.call('DELETE', `/api/chores/${c.id}`)).status).toBe(200);
        expect((await t.call('DELETE', `/api/chores/${c.id}`)).status).toBe(404);
        const all = await (await t.call('GET', '/api/chores?includeDeleted=true')).json() as { chores: unknown[] };
        expect(all.chores).toHaveLength(1);
    });

    it('manages categories', async () => {
        const res = await t.call('POST', '/api/categories', t.person, { name: 'Küche' });
        const { category } = await res.json() as { category: { id: number } };
        expect((await t.call('POST', '/api/categories', t.person, { name: 'Küche' })).status).toBe(409);
        expect(await (await t.call('PATCH', `/api/categories/${category.id}`, t.person, { sort: 3 })).json())
            .toEqual({ category: { id: category.id, name: 'Küche', sort: 3 } });
        expect(await (await t.call('GET', '/api/categories', t.shared)).json()).toMatchObject({ categories: [{ name: 'Küche' }] });
        expect((await t.call('DELETE', `/api/categories/${category.id}`)).status).toBe(200);
        expect((await t.call('DELETE', `/api/categories/${category.id}`)).status).toBe(404);
    });

    it('manages persons without returning hashes', async () => {
        const res = await t.call('POST', '/api/persons', t.person, { name: 'Kaddi', haEntity: 'person.k', password: 'pw',
            notifyAction: 'notify.mobile_app_cronk' });
        expect(res.status).toBe(201);
        const { person } = await res.json() as { person: { id: number } };
        expect(JSON.stringify(await (await t.call('GET', '/api/persons')).json())).not.toContain('password');
        expect(await (await t.call('PATCH', `/api/persons/${person.id}`, t.person, { calendarEntity: 'calendar.k' })).json())
            .toMatchObject({ person: { calendarEntity: 'calendar.k' } });
        expect((await t.call('PATCH', '/api/persons/99', t.person, { sort: 1 })).status).toBe(404);
        expect((await t.call('POST', '/api/persons', t.person, { name: 'X', haEntity: 'not an entity' })).status).toBe(400);
        expect((await t.call('POST', '/api/auth/login', null, { name: 'Kaddi', password: 'pw' })).status).toBe(200);
    });

    it('reads and writes the settings', async () => {
        const { settings } = await (await t.call('GET', '/api/settings')).json() as { settings: typeof DEFAULT_SETTINGS };
        expect(settings.suggestion_count).toBe(3);
        const put = await t.call('PUT', '/api/settings', t.person, { ...settings, suggestion_count: 2 });
        expect(await put.json()).toMatchObject({ settings: { suggestion_count: 2 } });
        expect((await t.call('PUT', '/api/settings', t.person, { ...settings, time_zone: 'Mars/Base' })).status).toBe(400);
        const badSlot = { ...settings, capacity_slots: [{ days: [1], from: '10:00', to: '09:00', minutes: 5, energy: 1 }] };
        expect((await t.call('PUT', '/api/settings', t.person, badSlot)).status).toBe(400);
    });

    it('creates, lists and revokes tokens', async () => {
        const res = await t.call('POST', '/api/tokens', t.person, { kind: 'shared', label: 'Wandtablet' });
        expect(res.status).toBe(201);
        const { token, plain } = await res.json() as { token: { id: number }; plain: string };
        expect((await t.call('GET', '/api/suggestions', plain)).status).toBe(200);
        const list = await (await t.call('GET', '/api/tokens')).json() as { tokens: object[] };
        expect(list.tokens).toHaveLength(4);
        expect(JSON.stringify(list)).not.toContain('tokenHash');
        expect((await t.call('DELETE', `/api/tokens/${token.id}`)).status).toBe(200);
        expect((await t.call('GET', '/api/suggestions', plain)).status).toBe(401);
        expect((await t.call('POST', '/api/tokens', t.person, { kind: 'person', label: 'x' })).status).toBe(400);
    });

    it('returns the look-ahead and the overview', async () => {
        expect(await (await t.call('GET', '/api/lookahead', t.shared)).json()).toEqual({ hints: [], forecastAge: null });
        expect(await (await t.call('GET', '/api/overview', t.mcp)).json()).toHaveProperty('counts');
    });

    it('enforces the rights of the shared token', async () => {
        const created = await (await t.call('POST', '/api/chores', t.mcp, chore)).json() as { chore: { id: number } };
        const forbidden: [string, string, unknown?][] = [
            ['POST', '/api/chores', chore],
            ['PATCH', `/api/chores/${created.chore.id}`, { name: 'x' }],
            ['DELETE', `/api/chores/${created.chore.id}`],
            ['POST', '/api/categories', { name: 'x' }],
            ['PATCH', '/api/categories/1', { name: 'x' }],
            ['DELETE', '/api/categories/1'],
            ['GET', '/api/persons'],
            ['POST', '/api/persons', { name: 'x', haEntity: 'person.x' }],
            ['PATCH', '/api/persons/1', { name: 'x' }],
            ['GET', '/api/settings'],
            ['PUT', '/api/settings', DEFAULT_SETTINGS],
            ['GET', '/api/tokens'],
            ['POST', '/api/tokens', { kind: 'shared', label: 'x' }],
            ['DELETE', '/api/tokens/1'],
            ['GET', '/api/overview'],
        ];
        for (const [method, path, json] of forbidden) {
            expect([method, path, (await t.call(method, path, t.shared, json)).status]).toEqual([method, path, 403]);
        }
        for (const path of ['/api/suggestions', '/api/chores', `/api/chores/${created.chore.id}`, '/api/categories',
            '/api/lookahead']) {
            expect([path, (await t.call('GET', path, t.shared)).status]).toEqual([path, 200]);
        }
    });

    it('returns 404 for unknown API paths', async () => {
        expect((await t.call('GET', '/api/unknown')).status).toBe(404);
    });
});
