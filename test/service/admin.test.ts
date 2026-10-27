import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/types.ts';
import { createPerson, setSettings, updatePerson } from '../../src/service/admin.ts';
import { Clock, makeDeps } from './helpers.ts';

describe('change hooks', () => {
    it('reports changes of persons and settings', async () => {
        const deps = await makeDeps(new Clock('2026-10-27T09:00:00+01:00'));
        const calls: string[] = [];
        deps.onPersonsChanged = () => calls.push('persons');
        deps.onSettingsChanged = () => calls.push('settings');
        const p = await createPerson(deps, { name: 'Andi' });
        await updatePerson(deps, p.id, { haEntity: 'person.a', calendarEntity: 'calendar.a' });
        await setSettings(deps, { ...DEFAULT_SETTINGS, weather_entity: 'weather.other' });
        expect(calls).toEqual(['persons', 'persons', 'settings']);
    });
});
