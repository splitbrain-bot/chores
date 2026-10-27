import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';

/** Directory of the package with the Material Design icons. */
const PACKAGE_DIR = dirname(createRequire(import.meta.url).resolve('@mdi/svg/package.json'));

/** Time in seconds that a browser keeps an icon. */
const MAX_AGE = 30 * 24 * 3600;

/** An entry of the icon list of the package. */
interface MetaEntry {
    name: string;
    aliases: string[];
    tags: string[];
    deprecated: boolean;
}

/**
 * Creates the public routes of the Material Design icons: the list of all icons for the search and one SVG file
 * per icon.
 */
export function iconRoutes(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    let index: string | null = null;

    // each entry is the icon name and the search words
    app.get('/index.json', async (c) => {
        if (index === null) {
            const meta = JSON.parse(await readFile(join(PACKAGE_DIR, 'meta.json'), 'utf8')) as MetaEntry[];
            index = JSON.stringify(meta.filter((m) => !m.deprecated)
                .map((m) => [m.name, [...m.aliases, ...m.tags].join(' ').toLowerCase()]));
        }
        c.header('Cache-Control', `public, max-age=${MAX_AGE}`);
        return c.body(index, 200, { 'Content-Type': 'application/json' });
    });

    app.get('/:file{[a-z0-9]+(?:-[a-z0-9]+)*\\.svg}', async (c) => {
        let svg: string;
        try {
            svg = await readFile(join(PACKAGE_DIR, 'svg', c.req.param('file')), 'utf8');
        } catch {
            return c.json({ error: 'Not found' }, 404);
        }
        c.header('Cache-Control', `public, max-age=${MAX_AGE}`);
        return c.body(svg, 200, { 'Content-Type': 'image/svg+xml' });
    });

    app.all('*', (c) => c.json({ error: 'Not found' }, 404));
    return app;
}
