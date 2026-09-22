// Conversation storage and per-browser memory, off unless explicitly enabled.
//
// Rules:
// - Everything written is redacted first (see trace.mjs redact).
// - A visitor is a random browser id, not a person. Only that visitor's own
//   conversations can be read back, and there is no route that lists them.
// - Memory holds origins only: the last origin a traveler searched from.
//   Dates, cabins and budgets are one-off details and are never stored.
// - Conversations expire after retentionDays and purgeExpired() removes them.
// - A storage failure never reaches the traveler. Callers catch and trace.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { redact } from './trace.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ORIGIN = /^[A-Z]{3}(\|[A-Z]{3})*$/;
export const isVisitorId = value => typeof value === 'string' && UUID.test(value);
const MAX_TEXT = 8000;

// Only what an eval needs from a turn: who spoke, what was said, the outcome,
// and the tool the model chose. No trip state, no traces, no model metadata.
export function turnRecords({ text, result, toolCalls = [], latencyMs = null }) {
  const clip = value => String(redact(value ?? '')).slice(0, MAX_TEXT);
  return [
    { role: 'traveler', text: clip(text), status: null, tool: null, latencyMs: null },
    { role: 'assistant', text: clip(result?.text), status: typeof result?.status === 'string' ? result.status : null,
      tool: toolCalls.length ? redact(toolCalls.map(call => ({ name: call.name, arguments: call.arguments }))) : null, latencyMs },
  ];
}

function checkVisitor(visitorId) { if (!isVisitorId(visitorId)) throw new Error('Invalid visitor id.'); }
function checkOrigin(code) { if (typeof code !== 'string' || !ORIGIN.test(code)) throw new Error('Invalid origin code.'); }

export function createPostgresStore({ url, retentionDays = 90, poolSize = 3 }) {
  if (!url) throw new Error('Conversation storage needs DATABASE_URL.');
  const pool = new pg.Pool({ connectionString: url.replace('sslmode=require', 'sslmode=verify-full'), max: poolSize, idleTimeoutMillis: 30000 });
  pool.on('error', () => {}); // an idle client dropping must not crash the server
  return {
    kind: 'postgres',
    async touchVisitor(visitorId) {
      checkVisitor(visitorId);
      await pool.query('INSERT INTO visitors (id) VALUES ($1) ON CONFLICT (id) DO UPDATE SET last_seen_at = now()', [visitorId]);
    },
    async startConversation({ visitorId, model, promptVersion }) {
      checkVisitor(visitorId);
      const id = randomUUID();
      await pool.query(
        "INSERT INTO conversations (id, visitor_id, channel, model, prompt_version, retain_until) VALUES ($1, $2, 'web', $3, $4, now() + make_interval(days => $5))",
        [id, visitorId, String(model).slice(0, 120), String(promptVersion).slice(0, 60), retentionDays],
      );
      return id;
    },
    async appendMessages(conversationId, fromSeq, records) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [i, r] of records.entries()) {
          await client.query('INSERT INTO messages (conversation_id, seq, role, text, status, tool, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [conversationId, fromSeq + i, r.role, r.text, r.status, r.tool === null ? null : JSON.stringify(r.tool), r.latencyMs]);
        }
        await client.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [conversationId]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.release(); }
    },
    async memory(visitorId) {
      checkVisitor(visitorId);
      const row = (await pool.query('SELECT last_origin FROM visitor_memory WHERE visitor_id = $1', [visitorId])).rows[0];
      return { lastOrigin: row?.last_origin ?? null };
    },
    async rememberLastOrigin(visitorId, code) {
      checkVisitor(visitorId); checkOrigin(code);
      await pool.query('INSERT INTO visitor_memory (visitor_id, last_origin) VALUES ($1, $2) ON CONFLICT (visitor_id) DO UPDATE SET last_origin = EXCLUDED.last_origin, updated_at = now()', [visitorId, code]);
    },
    // A visitor's own conversations, newest first. The visitor filter is the
    // access rule: nothing here can return another visitor's rows.
    async conversationsFor(visitorId, limit = 20) {
      checkVisitor(visitorId);
      const conversations = (await pool.query('SELECT id, started_at FROM conversations WHERE visitor_id = $1 ORDER BY started_at DESC LIMIT $2', [visitorId, Math.min(Math.max(1, limit), 50)])).rows;
      const out = [];
      for (const c of conversations) {
        const messages = (await pool.query('SELECT m.role, m.text, m.status FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.conversation_id = $1 AND c.visitor_id = $2 ORDER BY m.seq', [c.id, visitorId])).rows;
        out.push({ id: c.id, startedAt: c.started_at, messages });
      }
      return out;
    },
    async purgeExpired() { return (await pool.query('SELECT purge_expired() AS n')).rows[0].n; },
    async close() { await pool.end(); },
  };
}

// Same interface, in memory. For tests, and to exercise the chat service's
// storage path without a database.
export function createMemoryStore({ retentionDays = 90, now = () => Date.now() } = {}) {
  const visitors = new Set(), memory = new Map(), conversations = new Map();
  return {
    kind: 'memory', conversations,
    async touchVisitor(visitorId) { checkVisitor(visitorId); visitors.add(visitorId); },
    async startConversation({ visitorId, model, promptVersion }) {
      checkVisitor(visitorId);
      const id = randomUUID();
      conversations.set(id, { id, visitorId, model, promptVersion, startedAt: now(), retainUntil: now() + retentionDays * 86400000, messages: [] });
      return id;
    },
    async appendMessages(conversationId, fromSeq, records) {
      const c = conversations.get(conversationId); if (!c) throw new Error('Unknown conversation.');
      records.forEach((r, i) => c.messages.push({ seq: fromSeq + i, ...r }));
    },
    async memory(visitorId) { checkVisitor(visitorId); return { lastOrigin: memory.get(visitorId) ?? null }; },
    async rememberLastOrigin(visitorId, code) { checkVisitor(visitorId); checkOrigin(code); memory.set(visitorId, code); },
    async conversationsFor(visitorId, limit = 20) {
      checkVisitor(visitorId);
      return [...conversations.values()].filter(c => c.visitorId === visitorId).sort((a, b) => b.startedAt - a.startedAt).slice(0, limit)
        .map(c => ({ id: c.id, startedAt: c.startedAt, messages: c.messages.map(({ role, text, status }) => ({ role, text, status })) }));
    },
    async purgeExpired() { let n = 0; for (const [id, c] of conversations) if (c.retainUntil < now()) { conversations.delete(id); n++; } return n; },
    async close() {},
  };
}

// The switch. Off unless CONVERSATION_STORE=postgres and DATABASE_URL are both
// set, so a deploy without them stores nothing.
export function storeFromEnvironment(env = process.env) {
  if (env.CONVERSATION_STORE !== 'postgres') return null;
  if (!env.DATABASE_URL) throw new Error('CONVERSATION_STORE=postgres needs DATABASE_URL.');
  return createPostgresStore({ url: env.DATABASE_URL, retentionDays: Number(env.CONVERSATION_RETENTION_DAYS) || 90 });
}
