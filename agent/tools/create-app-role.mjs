// Creates or updates the application's database login with rows-only access.
// Run as the database owner. Both the owner URL and the new password are
// passed for this one command and never stored or printed:
//   DATABASE_OWNER_URL=... APP_ROLE=agent_runtime APP_PASSWORD=... node tools/create-app-role.mjs
//
// The login is created in SQL rather than through a provider console, because
// some providers add console-created roles to an admin group (Neon adds
// neon_superuser). This one belongs to no group and can only read and write
// the conversation tables.
import pg from 'pg';

const { DATABASE_OWNER_URL: url, APP_ROLE: role, APP_PASSWORD: password } = process.env;
if (!url || !role || !password) { console.error('Set DATABASE_OWNER_URL, APP_ROLE and APP_PASSWORD for this command only.'); process.exit(1); }
if (!/^[a-z_][a-z0-9_]{2,30}$/.test(role)) throw new Error('Role name must be lower-case letters, digits and underscores.');
if (!/^[A-Za-z0-9]{32,64}$/.test(password)) throw new Error('Password must be 32 to 64 letters and digits.');
const tables = ['visitors', 'visitor_memory', 'conversations', 'messages'];
const client = new pg.Client({ connectionString: url.replace('sslmode=require', 'sslmode=verify-full') });
await client.connect();
try {
  const exists = (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount > 0;
  // Role names and passwords cannot be bind parameters; both are validated above.
  await client.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
  const database = (await client.query('SELECT current_database() d')).rows[0].d;
  await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(database)} TO ${role}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tables.join(', ')} TO ${role}`);
  await client.query(`GRANT EXECUTE ON FUNCTION purge_expired() TO ${role}`);
  console.log(`${exists ? 'updated' : 'created'} ${role}: rows only on ${tables.join(', ')}`);
} finally { await client.end(); }
