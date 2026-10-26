import { loadConfig } from '../config.ts';
import { createDatabase } from './database.ts';

const db = await createDatabase(loadConfig().DATABASE_PATH);
await db.destroy();
console.log('Migrations done');
