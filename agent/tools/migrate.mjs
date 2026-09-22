// Applies db/migrations in order with the database OWNER login, which is
// never stored: pass it for this one command, e.g.
//   DATABASE_OWNER_URL="$(neonctl connection-string --project-id <id> --database-name agent)" node tools/migrate.mjs
// The application's own login (DATABASE_URL) cannot change the schema.
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';

const url = process.env.DATABASE_OWNER_URL;
if (!url) { console.error('Set DATABASE_OWNER_URL for this command only.'); process.exit(1); }
const dir = new URL('../db/migrations/', import.meta.url);
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
await client.connect();
try {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  for (const name of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(name)) { console.log(`skip ${name}`); continue; }
    await client.query('BEGIN');
    try {
      await client.query(await readFile(new URL(name, dir), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`applied ${name}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally { await client.end(); }
