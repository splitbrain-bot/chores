import type { Hono } from 'hono';
import { createMcpHandler, McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Viewer } from '../core/types.ts';
import {
    createCategory, getSettings, listCategories, listPersons, setSettings, updateCategory, updatePerson,
} from '../service/admin.ts';
import type { Identity } from '../service/auth.ts';
import { createChore, deleteChore, getChore, listChores, updateChore } from '../service/chores.ts';
import { createCondition, deleteCondition, listConditions, updateCondition } from '../service/conditions.ts';
import type { Deps } from '../service/deps.ts';
import { markDone, postpone } from '../service/feedback.ts';
import { getLookahead } from '../service/lookahead.ts';
import { getOverview } from '../service/overview.ts';
import { listPresence } from '../service/presence.ts';
import { getSuggestions } from '../service/suggestions.ts';
import { categorySchema, categoryUpdateSchema, personUpdateSchema } from '../schemas/admin.ts';
import { choreInputSchema, choreUpdateSchema } from '../schemas/chore.ts';
import { conditionSchema, conditionUpdateSchema } from '../schemas/condition.ts';
import { postponeSchema } from '../schemas/feedback.ts';
import { settingsSchema, slotSchema } from '../schemas/settings.ts';
import { bearer } from './auth.ts';
import type { AppEnv } from './env.ts';

const id = z.number().int().positive();

/**
 * Builds a tool result with the object as JSON text and as structured content.
 *
 * @param value the result object
 */
function result(value: Record<string, unknown>) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value };
}

/**
 * Creates an MCP server with all tools for one identity.
 *
 * @param deps the dependencies
 * @param version the version of the tool
 * @param identity the identity of the request
 */
export function createMcpServer(deps: Deps, version: string, identity: Identity): McpServer {
    const server = new McpServer({ name: 'chores', version });
    const viewer = identity.viewer;

    server.registerTool('list_persons', {
        description: 'Lists the household members with their Home Assistant entities, their presence at home and the '
            + 'distance from home in km.',
    }, async () => {
        const presence = await listPresence(deps);
        const persons = (await listPersons(deps)).map((p) => ({ ...p, ...presence.find((s) => s.personId === p.id) }));
        return result({ persons });
    });

    server.registerTool('update_person', {
        description: 'Changes the given values of a person. A person without a person entity counts as always at home.',
        inputSchema: personUpdateSchema.omit({ password: true }).extend({ id }),
    }, async ({ id: personId, ...values }) => result({ person: await updatePerson(deps, personId, values) }));

    server.registerTool('get_settings', {
        description: 'Returns all settings: the parameters and the capacity slots.',
    }, async () => result({ settings: await getSettings(deps) }));

    server.registerTool('update_settings', {
        description: 'Changes the given parameters. The capacity slots have their own tool.',
        inputSchema: settingsSchema.omit({ capacity_slots: true }).partial(),
    }, async (values) => result({ settings: await setSettings(deps, { ...(await getSettings(deps)), ...values }) }));

    server.registerTool('set_capacity_slots', {
        description: 'Replaces all capacity slots. A slot gives the free minutes and the energy from 0 to 5 of each '
            + 'person in a time window on some weekdays. Public holidays use the slots of Sunday. Outside of all slots '
            + 'the capacity is zero.',
        inputSchema: z.object({ slots: z.array(slotSchema) }),
    }, async ({ slots }) => {
        const settings = await setSettings(deps, { ...(await getSettings(deps)), capacity_slots: slots });
        return result({ slots: settings.capacity_slots });
    });

    server.registerTool('list_categories', {
        description: 'Lists the categories of the chores, for example the rooms.',
    }, async () => result({ categories: await listCategories(deps) }));

    server.registerTool('create_category', {
        description: 'Creates a category.',
        inputSchema: categorySchema,
    }, async ({ name, sort, icon }) => result({ category: await createCategory(deps, name, sort, icon) }));

    server.registerTool('update_category', {
        description: 'Changes the given values of a category: the name, the sort position or the icon.',
        inputSchema: categoryUpdateSchema.extend({ id }),
    }, async ({ id: categoryId, ...values }) => result({ category: await updateCategory(deps, categoryId, values) }));

    server.registerTool('list_conditions', {
        description: 'Lists the conditions with their status. A state condition has the current result 1 or 0, or '
            + 'null with an error. A forecast condition has a result per day of the look-ahead. choreIds names the '
            + 'chores that use the condition.',
    }, async () => result({ conditions: await listConditions(deps) }));

    server.registerTool('create_condition', {
        description: 'Creates a condition. A chore uses a state condition as conditionId or boostId and a forecast '
            + 'condition as forecastId.',
        inputSchema: conditionSchema,
    }, async (args) => result({ condition: await createCondition(deps, args) }));

    server.registerTool('update_condition', {
        description: 'Changes the name, the template or the icon of a condition. All chores that use it get the change.',
        inputSchema: conditionUpdateSchema.extend({ id }),
    }, async ({ id: conditionId, ...values }) => result({ condition: await updateCondition(deps, conditionId, values) }));

    server.registerTool('delete_condition', {
        description: 'Deletes a condition. A condition that chores use cannot be deleted.',
        inputSchema: z.object({ id }),
    }, async (args) => {
        await deleteCondition(deps, args.id);
        return result({ ok: true });
    });

    server.registerTool('list_chores', {
        description: 'Lists the chores with their need level. A need level of 1 means the interval is over. '
            + 'blockedBy names the filters that keep a chore out of the suggestions.',
        inputSchema: z.object({
            query: z.string().optional().describe('Part of the name'),
            categoryId: id.optional(),
            kind: z.enum(['recurring', 'one_time']).optional(),
            minNeed: z.number().optional(),
            includeDeleted: z.boolean().optional(),
        }),
    }, async (args) => result({ chores: await listChores(deps, { ...args, q: args.query }) }));

    server.registerTool('get_chore', {
        description: 'Returns one chore with its last 20 events.',
        inputSchema: z.object({ id }),
    }, async (args) => result({ ...(await getChore(deps, args.id)) }));

    server.registerTool('create_chore', {
        description: 'Creates a chore. Intervals are in days, or in cycles for the growth counter. Times are '
            + 'milliseconds since the epoch.',
        inputSchema: choreInputSchema,
    }, async (args) => result({ chore: await createChore(deps, args) }));

    server.registerTool('update_chore', {
        description: 'Changes the given values of a chore.',
        inputSchema: choreUpdateSchema.extend({ id }),
    }, async ({ id: choreId, ...values }) => result({ chore: await updateChore(deps, choreId, values) }));

    server.registerTool('delete_chore', {
        description: 'Deletes a chore.',
        inputSchema: z.object({ id }),
    }, async (args) => {
        await deleteChore(deps, args.id);
        return result({ ok: true });
    });

    server.registerTool('mark_done', {
        description: 'Marks a chore as done. The time can be in the past, for example for work done yesterday.',
        inputSchema: z.object({
            id,
            at: z.number().int().optional().describe('Milliseconds since the epoch, default now'),
            also: z.array(id).optional().describe('Chores of the same group that were done together'),
        }),
    }, async (args) => result({ events: await markDone(deps, viewer, args.id, args.also ?? [], args.at) }));

    server.registerTool('postpone', {
        description: 'Postpones a chore. The reason not_yet makes the interval longer.',
        inputSchema: postponeSchema.extend({ id }),
    }, async (args) => result({ chore: await postpone(deps, viewer, args.id, args.reason) }));

    server.registerTool('get_suggestions', {
        description: 'Returns the suggestions as the app shows them, for one person or for the shared device.',
        inputSchema: z.object({ personId: id.optional() }),
    }, async (args) => {
        const forViewer: Viewer = args.personId ? { kind: 'person', personId: args.personId } : viewer;
        return result({ ...(await getSuggestions(deps, forViewer)) });
    });

    server.registerTool('get_lookahead', {
        description: 'Returns the hints for good days for some chores in the next days.',
    }, async () => result({ ...(await getLookahead(deps)) }));

    server.registerTool('get_overview', {
        description: 'Returns the data for a summary of the household state: presence, the chores with the highest '
            + 'need, neglected chores, deadlines, recent events, counts and the current capacity.',
    }, async () => result({ ...(await getOverview(deps)) }));

    return server;
}

/**
 * Adds the MCP route. Only tokens of kind mcp can use it.
 *
 * @param app the Hono app
 * @param deps the dependencies
 * @param version the version of the tool
 */
export function addMcpRoute(app: Hono<AppEnv>, deps: Deps, version: string): void {
    const identities = new WeakMap<AuthInfo, Identity>();
    const handler = createMcpHandler((ctx) => {
        const identity = ctx.authInfo && identities.get(ctx.authInfo);
        if (!identity) throw new Error('Missing identity');
        return createMcpServer(deps, version, identity);
    }, { onerror: (err) => console.error('MCP error', err) });

    app.all('/mcp', bearer(deps, ['mcp']), (c) => {
        const authInfo: AuthInfo = { token: 'mcp', clientId: String(c.var.identity.tokenId), scopes: [] };
        identities.set(authInfo, c.var.identity);
        return handler.fetch(c.req.raw, { authInfo });
    });
}
