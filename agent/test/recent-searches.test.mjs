import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMemoryStore, RECENT_SEARCHES_KEPT } from '../src/store.mjs';
import { createChatService } from '../src/chat-service.mjs';
import { makeFixtureAdapter } from '../src/fixtures.mjs';
import { isoToday } from '../src/search.mjs';
import { preferenceAction } from '../src/preferences.mjs';
import { shiftIso } from '../src/shared.mjs';

// Recent searches (2026-09-27): a returning browser sees the trips it ran,
// numbered in the welcome, and can run one again by number. They are shown
// back and used only when chosen. Nothing from them pre-fills a new trip.

const LONDON = 'LHR|LGW|LCY|STN|LTN',
  NEW_YORK = 'JFK|EWR|LGA',
  TOKYO = 'HND|NRT';
const visitor = () => randomUUID();
const search = (over = {}) => ({
  origin: LONDON,
  destination: NEW_YORK,
  dateFrom: shiftIso(isoToday(), 3),
  dateTo: shiftIso(isoToday(), 3),
  cabin: null,
  nonstopOnly: false,
  maxPriceUsd: null,
  lowestPriceUsd: null,
  ...over,
});

// ---- The store.
test('one row per route, newest first, and only the newest few are kept', async () => {
  let clock = 1000;
  const store = createMemoryStore({ now: () => clock++ }),
    id = visitor();
  await store.rememberSearch(id, search({ cabin: 'economy' }));
  await store.rememberSearch(id, search({ destination: TOKYO }));
  await store.rememberSearch(id, search({ cabin: 'first' }));
  const recent = await store.recentSearches(id, 5);
  assert.deepEqual(
    recent.map((r) => [r.destination, r.cabin]),
    [
      [NEW_YORK, 'first'],
      [TOKYO, null],
    ],
    'the repeated route replaced the older row',
  );
  for (const code of ['CDG', 'FCO', 'MAD', 'BER', 'AMS'])
    await store.rememberSearch(id, search({ destination: code }));
  assert.equal((await store.recentSearches(id, 50)).length, RECENT_SEARCHES_KEPT);
  assert.equal((await store.recentSearches(id)).length, 3, 'three by default');
});

test('a browser sees only its own recent searches, and forgetting clears them', async () => {
  const store = createMemoryStore(),
    a = visitor(),
    b = visitor();
  await store.rememberSearch(a, search());
  assert.deepEqual(await store.recentSearches(b), []);
  await store.forgetRecentSearches(a);
  assert.deepEqual(await store.recentSearches(a), []);
});

test('malformed searches are rejected before storage', async () => {
  const store = createMemoryStore(),
    id = visitor();
  for (const bad of [
    { origin: "LHR'; DROP TABLE x; --" },
    { dateFrom: '1 Oct' },
    { dateTo: shiftIso(isoToday(), 1), dateFrom: shiftIso(isoToday(), 2) },
    { cabin: 'luxury' },
    { nonstopOnly: 'yes' },
    { maxPriceUsd: 0 },
    { lowestPriceUsd: -5 },
  ])
    await assert.rejects(store.rememberSearch(id, search(bad)), /Invalid recent search/);
  await assert.rejects(store.recentSearches('not-a-visitor'), /Invalid visitor id/);
});

test('recent searches expire with conversation retention', async () => {
  let clock = 0;
  const store = createMemoryStore({ retentionDays: 1, now: () => clock }),
    id = visitor();
  await store.rememberSearch(id, search());
  clock = 2 * 86400000;
  assert.deepEqual(await store.recentSearches(id), []);
  assert.equal(await store.purgeExpired(), 1);
});

// ---- The chat.
const CALLS = {
  'London to New York economy': {
    name: 'find_flights',
    arguments: { origin: 'London', destination: 'New York', cabin: 'economy' },
  },
  'Tokyo to Seoul': { name: 'find_flights', arguments: { origin: 'Tokyo', destination: 'Seoul' } },
  'to Singapore next week': {
    name: 'find_flights',
    arguments: { destination: 'Singapore', dates: { mode: 'nextWeek' } },
  },
  'forget my recent searches': {
    name: 'travel_preferences',
    arguments: { action: 'propose', forget: ['recentSearches'] },
  },
};
const model = {
  complete: async (messages) => {
    const call = CALLS[messages.at(-1).content];
    return {
      tool_calls: [
        {
          id: 't',
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        },
      ],
    };
  },
};
const hosted = (store = null) =>
  createChatService({
    conversationStore: store,
    homeAirportScope: 'visitor',
    stagingFactory: () => Object.assign(makeFixtureAdapter('normal'), { snapshots: [] }),
    modelFactory: async () => model,
    preferenceStore: {
      label: 'shared',
      read: async () => ({}),
      replace: async () => {
        throw new Error('the shared preference object must never be written');
      },
    },
  });
const say = async (svc, id, text, key = null) => {
  const chat = await svc.start('staging-public', undefined, undefined, key, id);
  return { chat, turn: await svc.turn(chat.id, text) };
};

test('a search that returned is kept, with a stated cabin and the lowest matching price', async () => {
  const store = createMemoryStore(),
    id = visitor(),
    svc = hosted(store);
  const { turn } = await say(svc, id, 'London to New York economy');
  assert.equal(turn.result.status, 'results');
  await svc.settle();
  const [kept] = await store.recentSearches(id);
  assert.equal(kept.origin, LONDON);
  assert.equal(kept.destination, NEW_YORK);
  assert.equal(kept.cabin, 'economy');
  assert.equal(kept.dateFrom, turn.state.dates.from);
  assert.equal(kept.dateTo, turn.state.dates.to);
  const matched = turn.result.shortlist.filter((r) => !r.reasons.length).map((r) => r.priceUsd);
  assert.equal(kept.lowestPriceUsd, matched.length ? Math.min(...matched) : null);
});

test('a default cabin is not recorded as a choice', async () => {
  const store = createMemoryStore(),
    id = visitor(),
    svc = hosted(store);
  await say(svc, id, 'Tokyo to Seoul');
  await svc.settle();
  assert.equal((await store.recentSearches(id))[0].cabin, null);
});

test('the welcome lists recent searches by number, for that browser only', async () => {
  const store = createMemoryStore(),
    id = visitor(),
    svc = hosted(store);
  await say(svc, id, 'London to New York economy');
  await svc.settle();
  const welcome = await svc.welcome('staging-public', id);
  assert.match(
    welcome.text,
    /Pick up where you left off:\n1\. London \(all airports\) → New York \(all airports\) · .+ · Economy\nReply with a number, or ask for something new\./,
  );
  assert.ok(welcome.recentKey);
  for (const other of [visitor(), null, 'not-a-visitor']) {
    const w = await svc.welcome('staging-public', other);
    assert.equal(w.recentKey, undefined);
    assert.doesNotMatch(w.text, /Pick up/);
  }
});

test('choosing a recent search by number runs it again as a live search', async () => {
  const store = createMemoryStore(),
    id = visitor(),
    svc = hosted(store);
  await say(svc, id, 'London to New York economy');
  await svc.settle();
  const { recentKey } = await svc.welcome('staging-public', id);
  const { chat, turn } = await say(svc, id, '1', recentKey);
  assert.equal(chat.recentOffered, true);
  assert.equal(chat.dealsOffered, false);
  assert.equal(turn.result.status, 'results');
  assert.equal(turn.state.origin.code, LONDON);
  assert.equal(turn.state.destination.code, NEW_YORK);
  assert.equal(turn.state.cabin, 'economy');
  assert.equal(turn.state.originFromPreference, false);
});

test('another browser cannot use a recent-search key', async () => {
  const store = createMemoryStore(),
    id = visitor(),
    svc = hosted(store);
  await say(svc, id, 'London to New York economy');
  await svc.settle();
  const { recentKey } = await svc.welcome('staging-public', id);
  const { chat, turn } = await say(svc, visitor(), '1', recentKey);
  assert.equal(chat.recentOffered, false);
  assert.match(turn.result.text, /no active numbered menu/);
});

// Held-out D1: economy from the last search must not carry into a new trip.
test('a recent search never pre-fills a new trip', async () => {
  const store = createMemoryStore(),
    id = visitor(),
    svc = hosted(store);
  await say(svc, id, 'London to New York economy');
  await svc.settle();
  const { recentKey } = await svc.welcome('staging-public', id);
  const { turn } = await say(svc, id, 'to Singapore next week', recentKey);
  assert.equal(turn.state.cabin, 'business', 'the default, not economy from before');
  assert.equal(turn.state.destination.code, 'SIN');
});

test('a recent search whose dates have passed runs over the next 7 days and says so', async () => {
  const store = createMemoryStore(),
    id = visitor(),
    svc = hosted(store);
  const past = shiftIso(isoToday(), -10);
  await store.touchVisitor(id);
  await store.rememberSearch(id, search({ dateFrom: past, dateTo: past, cabin: 'economy' }));
  const { recentKey, text } = await svc.welcome('staging-public', id);
  assert.match(text, /1\. London .+ · dates passed · Economy/);
  const { turn } = await say(svc, id, '1', recentKey);
  assert.match(
    turn.result.text,
    /^Those dates have passed\. Here’s the same trip over the next 7 days\./,
  );
  assert.equal(turn.state.dates.from, isoToday());
});

test('forgetting recent searches clears them and closes the open menu', async () => {
  const store = createMemoryStore(),
    id = visitor(),
    svc = hosted(store);
  await say(svc, id, 'London to New York economy');
  await svc.settle();
  const { recentKey } = await svc.welcome('staging-public', id);
  const chat = await svc.start('staging-public', undefined, undefined, recentKey, id);
  assert.equal(
    (await svc.turn(chat.id, 'forget my recent searches')).result.text,
    'Cleared your recent searches.',
  );
  assert.match((await svc.turn(chat.id, '1')).result.text, /no active numbered menu/);
  await svc.settle();
  assert.deepEqual(await store.recentSearches(id), []);
  assert.doesNotMatch((await svc.welcome('staging-public', id)).text, /Pick up/);
});

test('with storage off nothing is kept and the welcome is unchanged', async () => {
  const svc = hosted(),
    id = visitor();
  await say(svc, id, 'London to New York economy');
  const welcome = await svc.welcome('staging-public', id);
  assert.equal(welcome.recentKey, undefined);
  assert.doesNotMatch(welcome.text, /Pick up/);
});

test('forget recentSearches is an explicit action only', () => {
  const r = preferenceAction(
    { action: 'propose', forget: ['recentSearches'] },
    { homeAirport: 'LHR' },
  );
  assert.equal(r.forgetRecentSearches, true);
  assert.equal(r.savedPreferences, undefined, 'the home airport is untouched');
  assert.equal(
    preferenceAction({ action: 'propose', homeAirport: null, cabin: null }, {})
      .forgetRecentSearches,
    undefined,
  );
});

// ---- Held-out D6-D10 are satisfiable. The intended tool calls, replayed
// through the eval harness's own memory between sessions, pass every exact
// check. A live failure is then the model, not the case or the harness.
import { SearchConversation } from '../src/search.mjs';
import { Agent } from '../src/model.mjs';
import { applyPreferences } from '../src/preferences.mjs';
import { HARDENING_CASES_V2, HARDENING_V2_CLOCK } from '../evals/hardening-cases-v2.mjs';
import {
  gradeV2Step,
  rememberFromStep,
  applyMemory,
  offerRecentFromMemory,
} from '../evals/hardening-v2.mjs';

const INTENDED = {
  'London to New York economy': {
    name: 'find_flights',
    arguments: { origin: 'London', destination: 'New York', cabin: 'economy' },
  },
  'forget my recent searches': {
    name: 'travel_preferences',
    arguments: { action: 'propose', forget: ['recentSearches'] },
  },
  'forget where I fly from': {
    name: 'travel_preferences',
    arguments: { action: 'propose', forget: ['homeAirport'] },
  },
  'to Singapore next week': {
    name: 'find_flights',
    arguments: { destination: 'Singapore', dates: { mode: 'nextWeek' } },
  },
  'from Gatwick to Singapore': {
    name: 'find_flights',
    arguments: { origin: 'Gatwick', destination: 'Singapore' },
  },
  'Dubai to Singapore': {
    name: 'find_flights',
    arguments: { origin: 'Dubai', destination: 'Singapore' },
  },
};
for (const caseId of ['D6', 'D7', 'D8', 'D9', 'D10'])
  test(`held-out ${caseId} is satisfiable with the intended calls`, async () => {
    const item = HARDENING_CASES_V2.find((c) => c.id === caseId),
      memory = {},
      saved = { ...(item.initialPreferences ?? {}) };
    const scripted = {
      complete: async (m) => {
        const c = INTENDED[m.at(-1).content];
        return {
          tool_calls: [
            {
              id: 'r',
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.arguments) },
            },
          ],
        };
      },
    };
    const welcomes = [];
    for (const session of item.sessions) {
      const adapter = makeFixtureAdapter('normal'),
        conversation = new SearchConversation({ adapter, today: () => HARDENING_V2_CLOCK });
      applyPreferences(conversation, saved);
      applyMemory(memory, conversation, saved);
      welcomes.push(offerRecentFromMemory(memory, conversation));
      const agent = new Agent({ conversation, preferences: saved, model: scripted });
      for (const step of session.steps) {
        const result = await agent.respond(step.text);
        rememberFromStep(memory, result, conversation);
        const grade = gradeV2Step(step.expected, result, conversation, adapter, saved);
        assert.ok(
          grade.pass,
          `${caseId} "${step.text}": ${JSON.stringify(grade.checks.filter((c) => !c.pass))}`,
        );
      }
    }
    assert.equal(welcomes[0], null, 'a first conversation has no recent searches');
    if (caseId === 'D6') assert.match(welcomes[1], /^Pick up where you left off:\n1\. London/);
    if (caseId === 'D7') assert.equal(welcomes[2], null, 'forgotten searches are not listed');
    if (caseId === 'D9') assert.match(welcomes[1], /1\. London Gatwick/);
    if (caseId === 'D10') assert.match(welcomes[1], /1\. London .+ Economy/);
  });

// The calls Sonnet 5 actually made in the memory check on 2026-09-27: the
// right forget list with action 'show'. Replayed through the harness, the
// cases now pass, and case ids are unique.
test('a forget sent with action show is still acted on (recorded Sonnet 5 calls)', async () => {
  const recorded = {
    ...INTENDED,
    'forget my recent searches': {
      name: 'travel_preferences',
      arguments: { action: 'show', forget: ['recentSearches'] },
    },
    'forget where I fly from': {
      name: 'travel_preferences',
      arguments: { action: 'show', forget: ['homeAirport'] },
    },
  };
  for (const caseId of ['D7', 'D8']) {
    const item = HARDENING_CASES_V2.find((c) => c.id === caseId),
      memory = {},
      saved = {};
    const scripted = {
      complete: async (m) => {
        const c = recorded[m.at(-1).content];
        return {
          tool_calls: [
            {
              id: 'r',
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.arguments) },
            },
          ],
        };
      },
    };
    for (const session of item.sessions) {
      const adapter = makeFixtureAdapter('normal'),
        conversation = new SearchConversation({ adapter, today: () => HARDENING_V2_CLOCK });
      applyMemory(memory, conversation, saved);
      offerRecentFromMemory(memory, conversation);
      const agent = new Agent({ conversation, preferences: saved, model: scripted });
      for (const step of session.steps) {
        const result = await agent.respond(step.text);
        rememberFromStep(memory, result, conversation);
        const grade = gradeV2Step(step.expected, result, conversation, adapter, saved);
        assert.ok(
          grade.pass,
          `${caseId} "${step.text}": ${JSON.stringify(grade.checks.filter((c) => !c.pass))}`,
        );
      }
    }
  }
  const ids = HARDENING_CASES_V2.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'every held-out case id is unique');
});
