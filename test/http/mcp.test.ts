import { beforeEach, describe, expect, it } from 'vitest';
import { DAY } from '../../src/core/types.ts';
import { addMcpRoute } from '../../src/http/mcp.ts';
import { testApp, type TestApp } from './helpers.ts';

const meta = {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
    'io.modelcontextprotocol/clientCapabilities': {},
};

describe('MCP endpoint', () => {
    let t: TestApp;
    let nextId = 1;

    /**
     * Calls a tool with the 2026-07-28 protocol and returns the structured content.
     */
    async function tool(name: string, args: Record<string, unknown> = {}, token = t.mcp): Promise<{ isError?: boolean;
        structuredContent?: Record<string, unknown>; content: { text: string }[] }> {
        const res = await t.app.request('/mcp', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${token}`, 'content-type': 'application/json',
                accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2026-07-28',
                'mcp-method': 'tools/call', 'mcp-name': name,
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'tools/call',
                params: { name, arguments: args, _meta: meta } }),
        });
        expect(res.status).toBe(200);
        const body = await res.json() as { result: never };
        return body.result;
    }

    beforeEach(async () => {
        t = await testApp();
        addMcpRoute(t.app, t.deps, 'test');
    });

    it('accepts only mcp tokens', async () => {
        const post = (token: string | null) => t.app.request('/mcp', {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: '{}',
        });
        expect((await post(null)).status).toBe(401);
        expect((await post(t.person)).status).toBe(403);
        expect((await post(t.shared)).status).toBe(403);
    });

    it('serves the 2025 protocol without a session', async () => {
        const headers = { authorization: `Bearer ${t.mcp}`, 'content-type': 'application/json',
            accept: 'application/json, text/event-stream' };
        const init = await t.app.request('/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1,
            method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) });
        expect(await init.text()).toContain('"protocolVersion":"2025-11-25"');
        const list = await t.app.request('/mcp', { method: 'POST', headers: { ...headers, 'mcp-protocol-version': '2025-11-25' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) });
        const text = await list.text();
        for (const name of ['list_persons', 'list_categories', 'create_category', 'list_chores', 'get_chore', 'create_chore',
            'update_chore', 'delete_chore', 'mark_done', 'postpone', 'get_suggestions', 'get_lookahead', 'get_overview']) {
            expect(text).toContain(`"name":"${name}"`);
        }
        expect(text).toContain('"durationMin"');
    });

    it('runs every tool', async () => {
        const persons = await tool('list_persons');
        expect(persons.structuredContent).toMatchObject({ persons: [{ name: 'Andi', home: false }] });
        expect(JSON.parse(persons.content[0]!.text)).toEqual(persons.structuredContent);

        const { category } = (await tool('create_category', { name: 'Küche' })).structuredContent as { category: { id: number } };
        expect((await tool('list_categories')).structuredContent).toEqual({ categories: [{ id: category.id, name: 'Küche', sort: 0 }] });

        const created = await tool('create_chore', { name: 'Fußboden wischen', groupKey: 'fussboden-wischen', kind: 'recurring',
            growth: 'usage', interval: 7, importance: 'normal', durationMin: 15, effort: 2, assignment: 'any',
            categoryIds: [category.id], lastDoneAt: t.clock.t - 3 * DAY });
        const choreId = (created.structuredContent as { chore: { id: number } }).chore.id;
        expect(created.structuredContent).toMatchObject({ chore: { intervalMin: 1.75, intervalMax: 28 } });

        const invalid = await tool('create_chore', { name: 'x', kind: 'recurring', growth: 'time', importance: 'normal',
            durationMin: 5, effort: 1, assignment: 'any' });
        expect(invalid.isError).toBe(true);
        expect(invalid.content[0]!.text).toContain('interval');

        expect((await tool('update_chore', { id: choreId, effort: 3 })).structuredContent).toMatchObject({ chore: { effort: 3 } });
        expect((await tool('list_chores', { query: 'fuß' })).structuredContent).toMatchObject({ chores: [{ id: choreId }] });
        expect((await tool('list_chores', { minNeed: 5 })).structuredContent).toEqual({ chores: [] });

        const done = await tool('mark_done', { id: choreId, at: t.clock.t - DAY });
        expect(done.structuredContent).toMatchObject({ events: [{ choreId }] });
        const detail = await tool('get_chore', { id: choreId });
        expect(detail.structuredContent).toMatchObject({ chore: { lastDoneAt: t.clock.t - DAY },
            events: [{ type: 'done', personId: expect.any(Number) }] });

        expect((await tool('postpone', { id: choreId, reason: 'no_time' })).structuredContent)
            .toMatchObject({ chore: { snoozedUntil: expect.any(Number) } });
        expect((await tool('get_suggestions')).structuredContent).toHaveProperty('suggestions');
        expect((await tool('get_suggestions', { personId: 1 })).structuredContent).toHaveProperty('capacity');
        expect((await tool('get_lookahead')).structuredContent).toEqual({ hints: [], forecastAge: null });
        expect((await tool('get_overview')).structuredContent).toHaveProperty('counts.byKind.recurring', 1);

        expect((await tool('delete_chore', { id: choreId })).structuredContent).toEqual({ ok: true });
        expect((await tool('get_chore', { id: 999 })).isError).toBe(true);
    });
});
