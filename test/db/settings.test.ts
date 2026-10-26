import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/types.ts';
import { getSettings, putSettings } from '../../src/db/settings.ts';
import { memoryDb } from './helpers.ts';

describe('settings', () => {
    it('returns the defaults and stores changes', async () => {
        const db = await memoryDb();
        expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
        await putSettings(db, { suggestion_count: 5, ha_frame_ancestors: ['https://ha.example'] });
        await putSettings(db, { suggestion_count: 4 });
        const s = await getSettings(db);
        expect(s.suggestion_count).toBe(4);
        expect(s.ha_frame_ancestors).toEqual(['https://ha.example']);
        expect(s.capacity_slots).toEqual(DEFAULT_SETTINGS.capacity_slots);
    });
});
