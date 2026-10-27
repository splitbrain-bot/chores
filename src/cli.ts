import { parseArgs } from 'node:util';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { personSchema } from './schemas/admin.ts';
import { createPerson } from './service/admin.ts';
import type { Deps } from './service/deps.ts';
import { ServiceError } from './service/errors.ts';

/** Input and output of the command line tool. */
export interface CliIo {
    /** Asks for a password without showing it. */
    readPassword: (prompt: string) => Promise<string>;
    print: (text: string) => void;
}

const USAGE = `Usage: chores <command>

Commands:
  add-person <name>   Create a person with a password. The Home Assistant entities
                      of the person are set later in the settings screen.`;

/**
 * Runs one command of the command line tool.
 *
 * @param argv the arguments after the program name
 * @param deps the dependencies
 * @param io the input and output
 * @returns the exit code
 */
export async function runCli(argv: string[], deps: Deps, io: CliIo): Promise<number> {
    const { positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true });
    const [command, ...args] = positionals;

    if (command !== 'add-person' || args.length !== 1) {
        io.print(USAGE);
        return 2;
    }

    const password = await io.readPassword('Password: ');
    if (password !== await io.readPassword('Repeat the password: ')) {
        io.print('The passwords are not the same');
        return 1;
    }
    const input = personSchema.safeParse({ name: args[0], password });
    if (!input.success) {
        io.print(input.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
        return 1;
    }
    try {
        const person = await createPerson(deps, input.data);
        io.print(`Created the person ${person.name}`);
        return 0;
    } catch (err) {
        if (err instanceof ServiceError) {
            io.print(err.message);
            return 1;
        }
        throw err;
    }
}

/** Received characters after the last line that a prompt has read. */
let pending = '';

/**
 * Reads a line from the terminal without an echo. Without a terminal, it reads the next line of the standard input.
 *
 * @param prompt the prompt text
 */
function readPassword(prompt: string): Promise<string> {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    return new Promise((resolve) => {
        let value = '';
        const raw = stdin.isTTY;
        const finish = () => {
            stdin.off('data', onData);
            stdin.pause();
            if (raw) stdin.setRawMode(false);
            process.stdout.write('\n');
            resolve(value);
        };
        const consume = (chunk: string): boolean => {
            for (let i = 0; i < chunk.length; i++) {
                const char = chunk[i]!;
                if (char === '\r' || char === '\n') {
                    pending = chunk.slice(chunk[i + 1] === '\n' && char === '\r' ? i + 2 : i + 1);
                    return true;
                }
                if (char === '\u0003') process.exit(130);
                if (char === '\u007f') value = value.slice(0, -1);
                else value += char;
            }
            return false;
        };
        const onData = (chunk: string) => {
            if (consume(chunk)) finish();
        };
        const rest = pending;
        pending = '';
        if (consume(rest)) {
            process.stdout.write('\n');
            resolve(value);
            return;
        }
        if (raw) stdin.setRawMode(true);
        stdin.setEncoding('utf8');
        stdin.on('data', onData);
        stdin.resume();
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const db = await createDatabase(loadConfig().DATABASE_PATH);
    const code = await runCli(process.argv.slice(2), { db, ha: null, now: Date.now }, {
        readPassword,
        print: (text) => console.log(text),
    });
    await db.destroy();
    process.exit(code);
}
