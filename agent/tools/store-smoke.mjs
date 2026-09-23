// Checks the Postgres store against a real database: writes, reads, memory,
// the visitor isolation rule and purging. Uses two throwaway visitors and
// deletes them at the end. Not part of CI (CI has no database).
//   node --env-file=.env tools/store-smoke.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPostgresStore, turnRecords } from '../store.mjs';

const store = createPostgresStore({ url: process.env.DATABASE_URL, retentionDays: 90 });
const a = randomUUID(), b = randomUUID();
const cleanup = new pg.Client({ connectionString: process.env.DATABASE_URL.replace('sslmode=require', 'sslmode=verify-full') });
await cleanup.connect();
try {
  await store.touchVisitor(a); await store.touchVisitor(b);
  const ca = await store.startConversation({ visitorId: a, model: 'openai/gpt-5.6-terra', promptVersion: 'flight-search-v1.6.0' });
  await store.appendMessages(ca, 0, turnRecords({ text: 'passport K1234567, London to Tokyo', result: { status: 'results', text: 'Found 3 options.' }, toolCalls: [{ name: 'find_flights', arguments: { origin: 'London' } }], latencyMs: 812 }));
  const cb = await store.startConversation({ visitorId: b, model: 'm', promptVersion: 'p' });
  await store.appendMessages(cb, 0, turnRecords({ text: 'Dubai to Paris', result: { status: 'results', text: 'ok' } }));
  const seenByA = await store.conversationsFor(a), seenByB = await store.conversationsFor(b);
  assert.deepEqual(seenByA.map(c => c.id), [ca]); console.log('✓ a sees only its own conversation');
  assert.deepEqual(seenByB.map(c => c.id), [cb]); console.log('✓ b sees only its own conversation');
  assert.deepEqual(seenByA[0].messages.map(m => m.role), ['traveler', 'assistant']); console.log('✓ messages stored in order');
  assert.ok(!JSON.stringify(seenByA).includes('K1234567')); console.log('✓ passport number redacted before storage');
  await store.rememberLastOrigin(a, 'LHR|LGW|LCY|STN|LTN');
  assert.equal((await store.memory(a)).lastOrigin, 'LHR|LGW|LCY|STN|LTN'); console.log('✓ last origin remembered');
  assert.equal((await store.memory(b)).lastOrigin, null); console.log('✓ other visitor has no memory');
  await assert.rejects(store.rememberLastOrigin(a, "LHR'; DROP TABLE messages; --"), /Invalid origin code/); console.log('✓ malformed origin rejected before SQL');
  await assert.rejects(store.conversationsFor("x' OR '1'='1"), /Invalid visitor id/); console.log('✓ malformed visitor id rejected before SQL');
  await cleanup.query("UPDATE conversations SET retain_until = now() - interval '1 day' WHERE id = $1", [cb]);
  assert.ok((await store.purgeExpired()) >= 1);
  assert.deepEqual(await store.conversationsFor(b), []); console.log('✓ expired conversation purged');
  assert.equal((await store.conversationsFor(a)).length, 1); console.log('✓ current conversation kept');
} finally {
  await cleanup.query('DELETE FROM visitors WHERE id = ANY($1)', [[a, b]]);
  await cleanup.end(); await store.close();
  console.log('cleaned up test visitors');
}
