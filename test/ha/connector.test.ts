import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HomeAssistant } from '../../src/ha/connection.ts';
import { renderOnce, TemplateManager } from '../../src/ha/templates.ts';
import { Watcher } from '../../src/ha/watcher.ts';
import { createChore, getChore } from '../../src/db/chores.ts';
import { insertStates, listStates } from '../../src/db/ha_state.ts';
import { listOccupancy } from '../../src/db/occupancy.ts';
import type { Database } from '../../src/db/database.ts';
import { memoryDb } from '../db/helpers.ts';
import { newChore } from '../db/fixtures.ts';
import { FakeHa } from './fake-ha.ts';

/**
 * Waits until a condition holds.
 */
async function until(check: () => Promise<boolean> | boolean): Promise<void> {
    for (let i = 0; i < 200; i++) {
        if (await check()) return;
        await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('Condition not met');
}

describe('Home Assistant connector', () => {
    let fake: FakeHa;
    let ha: HomeAssistant;
    let db: Database;

    beforeEach(async () => {
        fake = new FakeHa();
        const url = await fake.listen();
        ha = new HomeAssistant(url, fake.token);
        db = await memoryDb();
    });

    afterEach(async () => {
        ha.close();
        await fake.close();
    });

    it('connects and authenticates', async () => {
        await ha.start();
        expect(ha.connected).toBe(true);
    });

    it('rejects an invalid token', async () => {
        fake.token = 'other';
        await expect(ha.start()).rejects.toThrow('rejected the token');
    });

    it('subscribes to the watched entities and records state changes with the occupancy', async () => {
        await ha.start();
        const watcher = new Watcher(db, ha);
        await watcher.setEntities({ persons: ['person.a'], others: ['sensor.distance_a'] });
        const sub = fake.last('subscribe_trigger')!;
        expect(sub.trigger).toEqual({ trigger: 'state', entity_id: ['person.a', 'sensor.distance_a'] });

        fake.push(sub.id, { variables: { trigger: { entity_id: 'person.a',
            to_state: { state: 'home', last_changed: '2026-10-26T08:00:00Z' } } } });
        fake.push(sub.id, { variables: { trigger: { entity_id: 'sensor.distance_a',
            to_state: { state: '12.5', last_changed: '2026-10-26T08:01:00Z' } } } });
        fake.push(sub.id, { variables: { trigger: { entity_id: 'person.a',
            to_state: { state: 'not_home', last_changed: '2026-10-26T09:00:00Z' } } } });

        await until(async () => (await listStates(db, ['person.a', 'sensor.distance_a'])).length === 3);
        await until(async () => (await listOccupancy(db))[0]?.endAt !== null);
        expect(await listOccupancy(db)).toEqual([
            { startAt: Date.parse('2026-10-26T08:00:00Z'), endAt: Date.parse('2026-10-26T09:00:00Z'), clockStart: 0 },
        ]);
        expect(watcher.lastEventAt).not.toBeNull();

        await watcher.setEntities({ persons: ['person.a'], others: ['sensor.distance_a'] });
        expect(fake.commands.filter((c) => c.type === 'subscribe_trigger')).toHaveLength(1);
        await watcher.setEntities({ persons: ['person.a', 'person.k'], others: [] });
        await fake.waitFor('unsubscribe_events');
        expect(fake.last('subscribe_trigger')!.trigger).toEqual({ trigger: 'state', entity_id: ['person.a', 'person.k'] });
    });

    it('stores template results and errors', async () => {
        await ha.start();
        const chore = await createChore(db, newChore({ conditionTemplate: '{{ is_state("sun.sun", "above_horizon") }}',
            boostTemplate: '{{ false }}' }));
        const templates = new TemplateManager(db, ha);
        await templates.sync([chore]);
        expect(templates.size).toBe(2);
        const subs = fake.commands.filter((c) => c.type === 'render_template');
        const cond = subs.find((c) => String(c.template).includes('sun'))!;
        const boost = subs.find((c) => c !== cond)!;
        expect(cond.report_errors).toBe(true);

        fake.push(cond.id, { result: true, listeners: {} });
        fake.push(boost.id, { result: 'False', listeners: {} });
        await until(async () => (await getChore(db, chore.id))?.conditionResult === 1);
        await until(async () => (await getChore(db, chore.id))?.boostResult === 0);

        fake.push(cond.id, { error: 'UndefinedError: x', level: 'ERROR' });
        await until(async () => (await getChore(db, chore.id))?.templateError === 'UndefinedError: x');
        expect((await getChore(db, chore.id))?.conditionResult).toBeNull();

        await templates.sync([{ ...chore, boostTemplate: null }]);
        expect(templates.size).toBe(1);
        await fake.waitFor('unsubscribe_events');
    });

    it('stores the error of a template that Home Assistant rejects', async () => {
        await ha.start();
        fake.handlers.set('render_template', () => { throw new Error('TemplateSyntaxError'); });
        const chore = await createChore(db, newChore({ conditionTemplate: '{{ broken' }));
        await new TemplateManager(db, ha).sync([chore]);
        expect((await getChore(db, chore.id))?.templateError).toContain('TemplateSyntaxError');
    });

    it('renders a template once with variables', async () => {
        await ha.start();
        const promise = renderOnce(ha, '{{ day.precipitation == 0 }}', { day: { precipitation: 0 } });
        const cmd = await fake.waitFor('render_template');
        expect(cmd.variables).toEqual({ day: { precipitation: 0 } });
        fake.push(cmd.id, { result: true, listeners: {} });
        expect(await promise).toBe(true);
        await fake.waitFor('unsubscribe_events');
    });

    it('reconnects, subscribes again and fills the gap', async () => {
        await ha.start();
        const watcher = new Watcher(db, ha);
        await watcher.setEntities({ persons: ['person.a'], others: [] });
        const start = Date.now() - 3_600_000;
        await insertStates(db, [{ entityId: 'person.a', state: 'home', at: start }]);
        const gapFilled = new Promise<void>((resolve) => ha.onReady(() => {
            watcher.gapFill().then(resolve, resolve);
        }));
        fake.history = [[
            { entity_id: 'person.a', state: 'home', last_changed: new Date(start + 5).toISOString() },
            { state: 'not_home', last_changed: new Date(start + 1_800_000).toISOString() },
        ]];

        fake.dropConnections();
        await gapFilled;
        await fake.waitFor('subscribe_trigger', 2);
        expect(fake.historyRequests[0]?.searchParams.get('filter_entity_id')).toBe('person.a');
        expect((await listStates(db, ['person.a'])).map((s) => s.state)).toEqual(['home', 'not_home']);
        const occupancy = await listOccupancy(db);
        expect(occupancy).toHaveLength(1);
        expect(occupancy[0]!.endAt).not.toBeNull();
    });

    it('records the current states without previous records', async () => {
        await ha.start();
        fake.handlers.set('get_states', () => [
            { entity_id: 'person.a', state: 'home', last_changed: '2026-10-26T08:00:00Z' },
            { entity_id: 'light.x', state: 'on', last_changed: '2026-10-26T08:00:00Z' },
        ]);
        const watcher = new Watcher(db, ha);
        await watcher.setEntities({ persons: ['person.a'], others: [] });
        await watcher.gapFill(5000);
        expect(await listStates(db, ['person.a', 'light.x'])).toEqual([{ entityId: 'person.a', state: 'home', at: 5000 }]);
        expect(await listOccupancy(db)).toEqual([{ startAt: 5000, endAt: null, clockStart: 0 }]);
    });

    it('calls actions with a response', async () => {
        await ha.start();
        fake.handlers.set('call_service', () => ({ context: {}, response: { 'weather.home': { forecast: [] } } }));
        expect(await ha.callService('weather', 'get_forecasts', { type: 'daily' }, { entity_id: 'weather.home' }, true))
            .toEqual({ 'weather.home': { forecast: [] } });
        expect(fake.last('call_service')).toMatchObject({ domain: 'weather', service: 'get_forecasts', return_response: true,
            target: { entity_id: 'weather.home' } });
    });
});
