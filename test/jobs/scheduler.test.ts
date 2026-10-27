import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY, HOUR, MINUTE } from '../../src/core/types.ts';
import { getCache, setCache } from '../../src/db/cache.ts';
import { getChore } from '../../src/db/chores.ts';
import { createCondition } from '../../src/db/conditions.ts';
import { Scheduler, hintLine } from '../../src/jobs/scheduler.ts';
import { createPerson } from '../../src/service/admin.ts';
import { createChore } from '../../src/service/chores.ts';
import type { Deps } from '../../src/service/deps.ts';
import { calendarKey, FORECAST_KEY, HOLIDAYS_KEY } from '../../src/service/evaluate.ts';
import { FakeApi } from '../service/helpers.ts';
import { memoryDb } from '../db/helpers.ts';

describe('scheduler', () => {
    let fake: FakeApi;
    let deps: Deps & { ha: FakeApi };
    let scheduler: Scheduler;

    beforeEach(async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        // Wednesday 08:30
        vi.setSystemTime(new Date('2026-11-04T08:30:00+01:00'));
        fake = new FakeApi();
        fake.responses.set('weather.get_forecasts', { 'weather.home': { forecast: [
            { datetime: '2026-11-05T11:00:00+00:00', condition: 'sunny', temperature: 10, precipitation: 0 },
        ] } });
        fake.responses.set('calendar.get_events', (_data: unknown, target: { entity_id: string }) => {
            if (target.entity_id === 'calendar.holidays_in_germany') {
                return { [target.entity_id]: { events: [
                    { start: '2026-12-25', end: '2026-12-26', summary: 'Christmas Day', description: 'Public holiday' },
                    { start: '2026-11-18', end: '2026-11-19', summary: 'Repentance Day (Saxony)', description: 'Public holiday in Saxony' },
                ] } };
            }
            return { [target.entity_id]: { events: [
                { start: '2026-11-04T18:00:00+01:00', end: '2026-11-04T19:00:00+01:00', summary: 'Termin' },
            ] } };
        });
        deps = { db: await memoryDb(), ha: fake, now: Date.now };
        await createPerson(deps, { name: 'Andi', haEntity: 'person.a', calendarEntity: 'calendar.a',
            notifyAction: 'notify.mobile_app_phone_andi' });
        await createPerson(deps, { name: 'Kaddi', haEntity: 'person.k', notifyAction: 'notify.mobile_app_cronk' });
        scheduler = new Scheduler(deps);
    });

    afterEach(() => {
        scheduler.stop();
        vi.useRealTimers();
    });

    /**
     * Advances the fake time and lets the jobs finish.
     */
    async function advance(ms: number): Promise<void> {
        await vi.advanceTimersByTimeAsync(ms);
    }

    it('fills the caches at the start and refreshes them in their intervals', async () => {
        await setCache(deps.db, 'forecast_template:1:2026-11-05', true, 0);
        scheduler.start();
        await advance(0);
        expect((await getCache(deps.db, FORECAST_KEY))?.value).toHaveLength(1);
        expect(await getCache(deps.db, 'forecast_template:1:2026-11-05')).toBeUndefined();
        expect((await getCache(deps.db, calendarKey('calendar.a')))?.value).toEqual([{ start: Date.parse('2026-11-04T17:00:00Z'),
            end: Date.parse('2026-11-04T18:00:00Z'), summary: 'Termin', allDay: false }]);
        expect((await getCache(deps.db, HOLIDAYS_KEY))?.value).toEqual(['2026-12-25']);

        const count = (service: string) => fake.calls.filter((c) => `${c.domain}.${c.service}` === service).length;
        expect(count('weather.get_forecasts')).toBe(1);
        await advance(15 * MINUTE);
        expect(count('calendar.get_events')).toBe(3);
        await advance(45 * MINUTE);
        expect(count('weather.get_forecasts')).toBe(2);
    });

    it('sends one deadline notification per day at the notify hour', async () => {
        const chore = await createChore(deps, { name: 'Sprenger abgebaut und Wasser abgestellt', kind: 'recurring',
            growth: 'time', interval: 365, importance: 'critical', durationMin: 30, effort: 3, assignment: 'any',
            deadlineMd: '11-15', personIds: [2], lastDoneAt: Date.now() - 300 * DAY });
        const notifications = () => fake.calls.filter((c) => c.domain === 'notify');

        scheduler.start();
        await advance(0);
        expect(notifications()).toEqual([]);

        await advance(HOUR);
        expect(notifications()).toEqual([{ domain: 'notify', service: 'mobile_app_cronk',
            data: { title: 'Chores', message: 'Due by 15.11.: Sprenger abgebaut und Wasser abgestellt' }, target: undefined }]);
        expect((await getChore(deps.db, chore.id))?.lastNotifiedAt).toBe(Date.now());

        await advance(23 * HOUR);
        expect(notifications()).toHaveLength(1);
        await advance(HOUR);
        expect(notifications()).toHaveLength(2);
        await advance(HOUR);
        expect(notifications()).toHaveLength(2);
    });

    it('sends the weekend hints on Thursday once', async () => {
        vi.setSystemTime(new Date('2026-11-05T09:10:00+01:00'));
        await setCache(deps.db, FORECAST_KEY, [
            { datetime: '2026-11-07T11:00:00+00:00', condition: 'sunny', temperature: 12, precipitation: 0 },
        ], Date.now());
        const dry = await createCondition(deps.db, { name: 'Trocken', kind: 'forecast',
            template: '{{ day.precipitation == 0 }}' });
        await createChore(deps, { name: 'Dachrinne', kind: 'recurring', growth: 'time', interval: 180, importance: 'normal',
            durationMin: 60, effort: 4, assignment: 'any', personIds: [1], lastDoneAt: Date.now() - 200 * DAY,
            forecastId: dry.id });
        fake.responses.delete('weather.get_forecasts');
        await scheduler.sendNotifications();
        await scheduler.sendNotifications();
        const sent = fake.calls.filter((c) => c.domain === 'notify');
        expect(sent).toEqual([{ domain: 'notify', service: 'mobile_app_phone_andi',
            data: { title: 'Chores', message: 'Saturday: Dachrinne (sunny, 12 °C)' }, target: undefined }]);
    });

    it('keeps running after a failed job', async () => {
        fake.responses.set('weather.get_forecasts', new Error('down'));
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        scheduler.start();
        await advance(0);
        expect(error).toHaveBeenCalledWith('Job forecast failed', expect.any(Error));
        fake.responses.set('weather.get_forecasts', { 'weather.home': { forecast: [] } });
        await advance(HOUR);
        expect((await getCache(deps.db, FORECAST_KEY))?.value).toEqual([]);
    });
});

describe('hintLine', () => {
    it('formats a hint without weather', () => {
        expect(hintLine({ choreId: 1, choreName: 'Rasen', date: '2026-11-07', reasons: [{ code: 'quiet_day' }] }))
            .toBe('Saturday: Rasen');
    });
});
