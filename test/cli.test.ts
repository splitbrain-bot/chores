import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.ts';
import { listPersons } from '../src/db/persons.ts';
import { login } from '../src/service/auth.ts';
import { Clock, makeDeps } from './service/helpers.ts';

/**
 * Creates test input and output with fixed passwords.
 */
function io(...passwords: string[]) {
    const lines: string[] = [];
    return { lines, readPassword: async () => passwords.shift() ?? '', print: (text: string) => lines.push(text) };
}

describe('command line tool', () => {
    it('adds a person with a password', async () => {
        const deps = await makeDeps(new Clock('2026-10-27T09:00:00+01:00'));
        const out = io('geheim', 'geheim');
        expect(await runCli(['add-person', 'Andi', 'person.andreas_gohr'], deps, out)).toBe(0);
        expect(out.lines[0]).toContain('Created the person Andi');
        expect((await login(deps, 'andi', 'geheim')).person.haEntity).toBe('person.andreas_gohr');
    });

    it('refuses different passwords, invalid values and existing names', async () => {
        const deps = await makeDeps(new Clock('2026-10-27T09:00:00+01:00'));
        expect(await runCli(['add-person', 'Andi', 'person.a'], deps, io('a', 'b'))).toBe(1);
        expect(await runCli(['add-person', 'Andi', 'no entity'], deps, io('a', 'a'))).toBe(1);
        expect(await runCli(['add-person', 'Andi', 'person.a'], deps, io('', ''))).toBe(1);
        expect(await runCli(['add-person', 'Andi', 'person.a'], deps, io('a', 'a'))).toBe(0);
        const out = io('a', 'a');
        expect(await runCli(['add-person', 'ANDI', 'person.b'], deps, out)).toBe(1);
        expect(out.lines).toEqual(['The name exists already']);
        expect(await listPersons(deps.db)).toHaveLength(1);
    });

    it('prints the usage for unknown commands', async () => {
        const deps = await makeDeps(new Clock('2026-10-27T09:00:00+01:00'));
        const out = io();
        expect(await runCli(['remove-person', 'Andi'], deps, out)).toBe(2);
        expect(out.lines[0]).toContain('Usage: chores');
    });
});
