import { createDatabase } from '../../src/db/database.ts';
import { insertStates } from '../../src/db/ha_state.ts';
import { replaceOccupancy } from '../../src/db/occupancy.ts';
import { putSettings } from '../../src/db/settings.ts';
import { createToken as insertToken } from '../../src/db/tokens.ts';
import { DAY, DEFAULT_SETTINGS } from '../../src/core/types.ts';
import { createCategory, createPerson } from '../../src/service/admin.ts';
import { hashToken } from '../../src/service/auth.ts';
import { createChore } from '../../src/service/chores.ts';
import type { Deps } from '../../src/service/deps.ts';
import type { ChoreInput } from '../../src/schemas/chore.ts';

/** Plain token of the wall tablet in the seeded database. */
export const SHARED_TOKEN = 'e2e-shared-token';

/** Plain login token of Andi in the seeded database. */
export const PERSON_TOKEN = 'e2e-person-token';

/** Plain MCP token in the seeded database. */
export const MCP_TOKEN = 'e2e-mcp-token';

/**
 * Creates a database with persons, categories, chores and tokens. A capacity slot covers the whole day, so that
 * the suggestions do not depend on the time of the test run.
 *
 * @param path the SQLite file
 */
export async function seed(path: string): Promise<void> {
    const db = await createDatabase(path);
    const now = Date.now();
    const deps: Deps = { db, ha: null, now: () => now };

    await putSettings(db, {
        capacity_slots: [
            { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '23:59', minutes: 120, energy: 5 },
        ],
        ha_frame_ancestors: ['https://ha.example.org'],
        earlier_window_seconds: DEFAULT_SETTINGS.earlier_window_seconds,
    });

    const andi = await createPerson(deps, { name: 'Andi', haEntity: 'person.andreas_gohr', password: 'andi-pw',
        notifyAction: 'notify.mobile_app_phone_andi', color: '#2f6fdb' });
    const kaddi = await createPerson(deps, { name: 'Kaddi', haEntity: 'person.katrin_gohr', password: 'kaddi-pw',
        color: '#e07b1a' });
    await insertStates(db, [
        { entityId: andi.haEntity!, state: 'home', at: now - 2 * DAY },
        { entityId: kaddi.haEntity!, state: 'home', at: now - 2 * DAY },
    ]);
    await replaceOccupancy(db, [{ startAt: now - 2 * DAY, endAt: null, clockStart: 0 }]);

    const kitchen = await createCategory(deps, 'Küche', 1, 'stove');
    const bath = await createCategory(deps, 'Bad', 2, 'shower');
    await createCategory(deps, 'Garten', 3);

    const base = { kind: 'recurring', growth: 'time', importance: 'normal', assignment: 'any' } as const;
    const chores: ChoreInput[] = [
        { ...base, name: 'Fußboden wischen', groupKey: 'fussboden-wischen', interval: 7, durationMin: 20, effort: 3,
            categoryIds: [kitchen.id], lastDoneAt: now - 9.8 * DAY },
        { ...base, name: 'Fußboden wischen', groupKey: 'fussboden-wischen', interval: 7, durationMin: 15, effort: 3,
            categoryIds: [bath.id], lastDoneAt: now - 6 * DAY },
        { ...base, name: 'Spiegel putzen', interval: 14, durationMin: 5, effort: 1, categoryIds: [bath.id],
            lastDoneAt: now - 20 * DAY },
        { ...base, name: 'Kühlschrank auswischen', interval: 30, durationMin: 30, effort: 2, categoryIds: [kitchen.id],
            lastDoneAt: now - 50 * DAY, notes: 'Alles ausräumen und mit Essigwasser auswischen.\nGemüsefach separat spülen.\nDichtung nicht vergessen.' },
        { ...base, name: 'Fenster putzen', interval: 90, durationMin: 60, effort: 4, lastDoneAt: now - 10 * DAY,
            personIds: [andi.id, kaddi.id], noisy: true },
        { ...base, name: 'Regal bauen', kind: 'one_time', durationMin: 90, effort: 3, importance: 'optional' },
    ];
    for (const c of chores) await createChore(deps, c);

    await insertToken(db, { kind: 'shared', personId: null, label: 'Wandtablet', tokenHash: hashToken(SHARED_TOKEN),
        createdAt: now });
    await insertToken(db, { kind: 'person', personId: andi.id, label: 'Test', tokenHash: hashToken(PERSON_TOKEN),
        createdAt: now });
    await insertToken(db, { kind: 'mcp', personId: andi.id, label: 'Claude Code', tokenHash: hashToken(MCP_TOKEN),
        createdAt: now });
    await db.destroy();
}

if (import.meta.url === `file://${process.argv[1]}`) {
    await seed(process.argv[2] ?? 'data/e2e.sqlite');
}
