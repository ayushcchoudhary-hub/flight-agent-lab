import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMemoryStore, storeFromEnvironment, turnRecords, isVisitorId } from '../store.mjs';
import { createChatService } from '../chat-service.mjs';
import { makeFixtureAdapter } from '../fixtures.mjs';

// Conversation storage and memory. Off by default; when on, text is redacted,
// only the origin is remembered, and a storage failure never reaches a chat.

// A model that always proposes the search written in the message, so these
// tests exercise storage, not interpretation.
const CALLS = {
  'London to New York economy': { origin: 'London', destination: 'New York', cabin: 'economy' },
  'to Singapore next week': { destination: 'Singapore', dates: { mode: 'nextWeek' } },
  'Tokyo to Seoul': { origin: 'Tokyo', destination: 'Seoul' },
  'my passport number is K1234567, London to Paris': { origin: 'London', destination: 'Paris' },
};
const model = { complete: async messages => {
  const text = messages.at(-1).content;
  return { tool_calls: [{ id: 't', type: 'function', function: { name: 'find_flights', arguments: JSON.stringify(CALLS[text]) } }] };
} };
const service = ({ store = createMemoryStore(), preferences = {} } = {}) => createChatService({
  conversationStore: store,
  stagingFactory: () => Object.assign(makeFixtureAdapter('normal'), { snapshots: [] }),
  modelFactory: async () => model,
  preferenceStore: { label: 'test', read: async () => ({ ...preferences }), replace: async () => ({}) },
});
const visitor = () => randomUUID();

test('storage is off unless explicitly switched on', () => {
  assert.equal(storeFromEnvironment({}), null);
  assert.equal(storeFromEnvironment({ DATABASE_URL: 'postgres://x' }), null, 'a database URL alone does not turn storage on');
  assert.throws(() => storeFromEnvironment({ CONVERSATION_STORE: 'postgres' }), /needs DATABASE_URL/);
});

test('a chat without a store works exactly as before', async () => {
  const svc = createChatService({ stagingFactory: () => Object.assign(makeFixtureAdapter('normal'), { snapshots: [] }), modelFactory: async () => model,
    preferenceStore: { label: 'test', read: async () => ({}), replace: async () => ({}) } });
  const chat = await svc.start('staging-public', undefined, undefined, null, visitor());
  assert.equal((await svc.turn(chat.id, 'London to New York economy')).result.status, 'results');
});

test('every turn is recorded, redacted, in order', async () => {
  const store = createMemoryStore(), svc = service({ store }), id = visitor();
  const chat = await svc.start('staging-public', undefined, undefined, null, id);
  await svc.turn(chat.id, 'my passport number is K1234567, London to Paris');
  await svc.turn(chat.id, 'to Singapore next week');
  await svc.settle();
  const [conversation] = await store.conversationsFor(id);
  assert.deepEqual(conversation.messages.map(m => m.role), ['traveler', 'assistant', 'traveler', 'assistant']);
  assert.match(conversation.messages[0].text, /passport number is \[PASSPORT\]/);
  assert.ok(!JSON.stringify(conversation).includes('K1234567'));
  assert.equal(conversation.messages[1].status, 'results');
});

test('redaction covers tool arguments too, and long text is clipped', () => {
  const records = turnRecords({ text: 'call +44 20 7946 0958', result: { status: 'results', text: 'x'.repeat(9000) }, toolCalls: [{ name: 'find_flights', arguments: { origin: 'a@b.com' } }] });
  assert.equal(records[0].text, 'call [PHONE]');
  assert.equal(records[1].text.length, 8000);
  assert.equal(records[1].tool[0].arguments.origin, '[EMAIL]');
});

test('the last origin searched from becomes a disclosed default next time', async () => {
  const store = createMemoryStore(), id = visitor();
  const first = service({ store });
  await first.turn((await first.start('staging-public', undefined, undefined, null, id)).id, 'London to New York economy');
  await first.settle();
  assert.equal((await store.memory(id)).lastOrigin, 'LHR|LGW|LCY|STN|LTN');

  const second = service({ store });
  const chat = await second.start('staging-public', undefined, undefined, null, id);
  assert.equal(chat.remembered, true);
  assert.match(chat.text, /Using London \(all airports\) from your last search\./);
  const reply = (await second.turn(chat.id, 'to Singapore next week')).result;
  assert.equal(reply.status, 'results');
  assert.match(reply.text, /from your last search/);
});

test('only the origin is remembered: cabin and dates are one-off details', async () => {
  const store = createMemoryStore(), id = visitor();
  const first = service({ store });
  await first.turn((await first.start('staging-public', undefined, undefined, null, id)).id, 'London to New York economy');
  await first.settle();
  const second = service({ store });
  const chat = await second.start('staging-public', undefined, undefined, null, id);
  const turn = await second.turn(chat.id, 'to Singapore next week');
  assert.equal(turn.state.cabin, 'business', 'economy from a one-off search is not carried over');
});

test('another browser gets no memory', async () => {
  const store = createMemoryStore(), a = visitor(), b = visitor();
  const svc = service({ store });
  await svc.turn((await svc.start('staging-public', undefined, undefined, null, a)).id, 'London to New York economy');
  await svc.settle();
  const other = await service({ store }).start('staging-public', undefined, undefined, null, b);
  assert.equal(other.remembered, false);
  const aIds = new Set((await store.conversationsFor(a)).map(c => c.id));
  const bSees = await store.conversationsFor(b);
  assert.ok(aIds.size > 0);
  assert.ok(bSees.every(c => !aIds.has(c.id)), 'a browser can never read another browser’s conversations');
  assert.ok(bSees.every(c => c.messages.every(m => !/New York/.test(m.text))));
});

test('a saved home airport beats the last-used origin', async () => {
  const store = createMemoryStore(), id = visitor();
  await store.touchVisitor(id); await store.rememberLastOrigin(id, 'HND|NRT');
  const chat = await service({ store, preferences: { homeAirport: 'LHR' } }).start('staging-public', undefined, undefined, null, id);
  assert.equal(chat.remembered, false);
});

test('a newly chosen origin replaces the remembered one; a filled-in default does not', async () => {
  const store = createMemoryStore(), id = visitor();
  await store.touchVisitor(id); await store.rememberLastOrigin(id, 'LHR|LGW|LCY|STN|LTN');
  const filled = service({ store });
  await filled.turn((await filled.start('staging-public', undefined, undefined, null, id)).id, 'to Singapore next week');
  await filled.settle();
  assert.equal((await store.memory(id)).lastOrigin, 'LHR|LGW|LCY|STN|LTN');
  const chosen = service({ store });
  await chosen.turn((await chosen.start('staging-public', undefined, undefined, null, id)).id, 'Tokyo to Seoul');
  await chosen.settle();
  assert.equal((await store.memory(id)).lastOrigin, 'HND|NRT');
});

test('a storage failure never reaches the traveler', async () => {
  const broken = new Proxy(createMemoryStore(), { get: (target, key) => key === 'kind' ? 'broken' : async () => { throw new Error('database down'); } });
  const svc = service({ store: broken });
  const chat = await svc.start('staging-public', undefined, undefined, null, visitor());
  const turn = await svc.turn(chat.id, 'London to New York economy');
  await svc.settle();
  assert.equal(turn.result.status, 'results');
});

test('a malformed visitor id stores nothing', async () => {
  const store = createMemoryStore();
  const svc = service({ store });
  await svc.turn((await svc.start('staging-public', undefined, undefined, null, 'not-a-uuid')).id, 'London to New York economy');
  await svc.settle();
  assert.equal(store.conversations.size, 0);
  assert.equal(isVisitorId('not-a-uuid'), false);
});

test('expired conversations are purged, current ones kept', async () => {
  let now = Date.UTC(2026, 8, 22);
  const store = createMemoryStore({ retentionDays: 90, now: () => now }), id = visitor();
  await store.touchVisitor(id);
  await store.startConversation({ visitorId: id, model: 'm', promptVersion: 'p' });
  now += 89 * 86400000; assert.equal(await store.purgeExpired(), 0);
  now += 2 * 86400000; assert.equal(await store.purgeExpired(), 1);
});

// D1 with memory: replay the intended calls through the harness's own memory
// helpers, so the case is known satisfiable before a paid run.
import { SearchConversation } from '../search.mjs';
import { Agent } from '../model.mjs';
import { applyPreferences } from '../preferences.mjs';
import { HARDENING_CASES_V2, HARDENING_V2_CLOCK } from '../hardening-cases-v2.mjs';
import { gradeV2Step, rememberFromStep, applyMemory } from '../hardening-v2.mjs';
test('held-out D1 is satisfiable: London carries over disclosed, economy does not', async () => {
  const item = HARDENING_CASES_V2.find(c => c.id === 'D1'), memory = {}, saved = {};
  // Model-style calls: every field present, as the model sends them.
  const intended = { 'London to New York economy': { origin: 'London', destination: 'New York', cabin: 'economy' }, 'to Singapore next week': { origin: '', destination: 'Singapore', dates: { mode: 'nextWeek' }, maxPriceUsd: 0, aside: '' } };
  for (const session of item.sessions) {
    const adapter = makeFixtureAdapter('normal'), conversation = new SearchConversation({ adapter, today: () => HARDENING_V2_CLOCK });
    applyPreferences(conversation, saved); applyMemory(memory, conversation, saved);
    const agent = new Agent({ conversation, preferences: saved, model: { complete: async m => ({ tool_calls: [{ id: 'r', type: 'function', function: { name: 'find_flights', arguments: JSON.stringify(intended[m.at(-1).content]) } }] }) } });
    for (const step of session.steps) {
      const result = await agent.respond(step.text);
      rememberFromStep(memory, result, conversation);
      const grade = gradeV2Step(step.expected, result, conversation, adapter, saved);
      assert.ok(grade.pass, `"${step.text}": ${JSON.stringify(grade.checks.filter(c => !c.pass))}`);
    }
  }
});

test('a saved home airport stops memory being applied in the harness too', () => {
  const conversation = new SearchConversation({ adapter: makeFixtureAdapter('normal'), today: () => HARDENING_V2_CLOCK });
  applyPreferences(conversation, { homeAirport: 'LHR' });
  assert.equal(applyMemory({ lastOrigin: 'HND|NRT' }, conversation, { homeAirport: 'LHR' }), false);
  assert.equal(conversation.publicState().origin.code, 'LHR');
});
