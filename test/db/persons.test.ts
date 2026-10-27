import { describe, expect, it } from 'vitest';
import { countPersons, createPerson, getPerson, getPersonWithHash, listPersons, updatePerson } from '../../src/db/persons.ts';
import { memoryDb } from './helpers.ts';

describe('persons', () => {
    it('creates, reads, lists and updates persons', async () => {
        const db = await memoryDb();
        expect(await countPersons(db)).toBe(0);
        const andi = await createPerson(db, { name: 'Andi', haEntity: 'person.a', passwordHash: 'x:y', sort: 2 });
        await createPerson(db, { name: 'Kaddi', haEntity: 'person.k', calendarEntity: 'calendar.k' });
        expect(andi).toEqual({ id: 1, name: 'Andi', haEntity: 'person.a', distanceEntity: null, calendarEntity: null,
            notifyAction: null, sort: 2, color: '#808080' });
        expect(await countPersons(db)).toBe(2);
        expect((await listPersons(db)).map((p) => p.name)).toEqual(['Kaddi', 'Andi']);
        expect(await getPersonWithHash(db, 'Andi')).toMatchObject({ passwordHash: 'x:y' });
        expect(await getPersonWithHash(db, 'Nobody')).toBeUndefined();
        expect(await updatePerson(db, 1, { notifyAction: 'notify.a' })).toMatchObject({ notifyAction: 'notify.a', name: 'Andi' });
        expect(await updatePerson(db, 1, { color: '#336699' })).toMatchObject({ color: '#336699' });
        expect(await getPerson(db, 9)).toBeUndefined();
    });
});
