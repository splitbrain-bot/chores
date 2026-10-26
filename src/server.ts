import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { loadConfig } from './config.ts';

const config = loadConfig();
const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true }));

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    console.log(`Listening on port ${info.port}`);
});
