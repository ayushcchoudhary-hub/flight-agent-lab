import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchConversation, discoverTool } from '../search.mjs';
import { makeFixtureAdapter, fixtureDeals } from '../fixtures.mjs';
import { fetchDiscover, clearDiscoverCache } from '../staging.mjs';
import { validateDiscoverResponse, NO_ECONOMY_DEALS } from '../discover.mjs';
import { applyPreferences } from '../preferences.mjs';
import { createChatService } from '../chat-service.mjs';
import { compactForHistory } from '../model.mjs';

// "Take me anywhere": ranked deals from the product's public deals feed.
const TODAY = '2026-09-18';
const setup = (scenario = 'normal') => {
  const adapter = makeFixtureAdapter(scenario);
  return { adapter, c: new SearchConversation({ adapter, today: () => TODAY }) };
};
const posts = adapter => adapter.calls.filter(x => x.method === 'POST').length;
const feedCities = metro => new Set(fixtureDeals(metro, TODAY).tiles.map(t => t.city));
const listed = text => [...text.matchAll(/^\d+\. (?:[^→\n]+ → )?([^,\n]+),/gm)].map(m => m[1]);

// ---- The feed request is allowlisted: one path, two parameters, no login.
const okFeed = () => Response.json(fixtureDeals('London', TODAY));
test('the deals request is exactly one path with metro and limit, and no auth header', async () => {
  clearDiscoverCache();
  let seen;
  await fetchDiscover({ metro: 'London', limit: 5 }, { fetchImpl: async request => { seen = request; return okFeed(); } });
  const url = new URL(seen.url);
  assert.equal(seen.method, 'GET');
  assert.equal(url.pathname, '/v1/discover/flights');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['limit', 'metro']);
  assert.equal(url.searchParams.get('metro'), 'London');
  assert.equal(seen.headers.get('authorization'), null);
});

test('a city name cannot smuggle extra parameters or paths', async () => {
  clearDiscoverCache();
  for (const metro of ['London&limit=100', 'London/../admin', '<script>', 'x'.repeat(41), '']) {
    await assert.rejects(fetchDiscover({ metro, limit: 5 }, { fetchImpl: okFeed }), /Invalid deals city/);
  }
  await assert.rejects(fetchDiscover({ metro: 'London', limit: 500 }, { fetchImpl: okFeed }), /Invalid deals limit/);
});

test('the feed is cached for ten minutes across chats', async () => {
  clearDiscoverCache();
  let calls = 0, now = 0;
  const fetchImpl = async () => { calls++; return okFeed(); };
  await fetchDiscover({ metro: 'London', limit: 5 }, { fetchImpl, now: () => now });
  now += 9 * 60 * 1000; await fetchDiscover({ metro: 'London', limit: 5 }, { fetchImpl, now: () => now });
  assert.equal(calls, 1);
  now += 2 * 60 * 1000; await fetchDiscover({ metro: 'London', limit: 5 }, { fetchImpl, now: () => now });
  assert.equal(calls, 2);
});

test('unknown city, unpublished city and malformed feed are told apart', async () => {
  clearDiscoverCache();
  assert.deepEqual(await fetchDiscover({ metro: 'Aberdeen', limit: 5 }, { fetchImpl: async () => Response.json({ code: 'validationError' }, { status: 400 }) }), { unknownMetro: true });
  assert.deepEqual(await fetchDiscover({ metro: 'Paris', limit: 5 }, { fetchImpl: async () => Response.json({}, { status: 503 }) }), { unavailable: true });
  await assert.rejects(fetchDiscover({ metro: 'Tokyo', limit: 5 }, { fetchImpl: async () => Response.json({ tiles: 'nope' }) }), /unexpected response/);
});

test('feed text is cleaned before it can reach a reply', () => {
  const doc = fixtureDeals('London', TODAY);
  doc.tiles[0].city = 'Charlotte<script>alert(1)</script> **bold** [link](x)';
  const feed = validateDiscoverResponse(doc);
  assert.ok(!/[<>*[\]`]/.test(feed.deals[0].city));
  assert.ok(feed.deals[0].city.length <= 60);
});

// ---- Where the deals are from.
test('no origin known: deals across every departure city, each row naming its origin', async () => {
  const { adapter, c } = setup();
  const reply = await c.discover({});
  assert.equal(reply.status, 'deals');
  assert.match(reply.text, /across our departure cities/);
  assert.match(reply.text, /tell me where you’re flying from/);
  const rows = reply.text.split('\n').filter(line => /^\d+\. /.test(line));
  assert.ok(rows.length > 0 && rows.every(line => / → /.test(line)), 'every Everywhere row names where it departs from');
  assert.equal(posts(adapter), 0, 'showing deals is not a search');
});

test('a named place resolves to its departure city', async () => {
  for (const [origin, city] of [['London', 'London'], ['Heathrow', 'London'], ['JFK', 'New York'], ['Haneda', 'Tokyo'], ['from Tokyo', 'Tokyo']]) {
    const { c } = setup();
    const reply = await c.discover({ origin });
    assert.match(reply.text, new RegExp(`deals from ${city}`), `${origin} -> ${city}`);
  }
});

test('a city without deals says so and shows every departure city instead', async () => {
  for (const origin of ['Aberdeen', 'Narnia']) {
    const { c } = setup();
    const reply = await c.discover({ origin });
    assert.equal(reply.status, 'deals');
    assert.match(reply.text, new RegExp(`don’t have deals from ${origin} yet`));
    assert.match(reply.text, /across our departure cities/);
  }
});

test('origin order: named now, then the current trip, then a saved home airport, each disclosed', async () => {
  const trip = setup(); await trip.c.find({ origin: 'Paris', destination: 'New York' });
  assert.match((await trip.c.discover({})).text, /Using Paris from your current search\./);

  const home = setup(); applyPreferences(home.c, { homeAirport: 'LHR' });
  const saved = await home.c.discover({});
  assert.match(saved.text, /Using your saved home airport, London Heathrow Airport \(LHR\)\./);
  assert.match(saved.text, /deals from London/);

  const named = setup(); applyPreferences(named.c, { homeAirport: 'LHR' });
  const reply = await named.c.discover({ origin: 'Tokyo' });
  assert.match(reply.text, /deals from Tokyo/);
  assert.ok(!/saved home airport/.test(reply.text), 'a place named now wins without mentioning the saved one');
});

// ---- Honesty.
test('deals are shown as the feed returns them, past-dated ones included', async () => {
  // Product decision 2026-09-23: the feed decides. Past dates should only
  // appear on a stale staging feed, and the check date says how old it is.
  const { c } = setup('deals-past');
  const reply = await c.discover({ origin: 'London' });
  assert.equal(reply.status, 'deals');
  assert.ok(listed(reply.text).length > 0);
  assert.match(reply.text, /checked 10 Sept/);
});

test('choosing a past-dated deal searches that route from today, and says so', async () => {
  const { adapter, c } = setup('deals-past');
  await c.discover({ origin: 'London' });
  const reply = await c.choose(1);
  assert.equal(reply.status, 'results');
  assert.match(reply.text, /^That deal’s date has passed\. Here’s the same route over the next 7 days\./);
  assert.equal(c.publicState().dates.from, TODAY);
  assert.equal(posts(adapter), 1);
});

test('an unpublished feed says so without a list', async () => {
  const { c } = setup('deals-unavailable');
  const reply = await c.discover({ origin: 'London' });
  assert.match(reply.text, /don’t have current deals/);
  assert.ok(!/^\d+\. /m.test(reply.text));
});

test('every city shown comes from the feed', async () => {
  for (const [args, metro] of [[{}, 'Everywhere'], [{ origin: 'London' }, 'London'], [{ origin: 'Tokyo' }, 'Tokyo']]) {
    const { c } = setup();
    const cities = listed((await c.discover(args)).text);
    assert.ok(cities.length > 0);
    for (const city of cities) assert.ok(feedCities(metro).has(city), `${city} is not in the ${metro} feed`);
  }
});

test('a deals reply shows price and typical price, the check date and the footnote, nothing else', async () => {
  const { c } = setup();
  const text = (await c.discover({ origin: 'London' })).text;
  assert.match(text, /USD 1,290 · usually USD 10,805/);
  assert.match(text, /checked 18 Sept\. Prices can change\./);
  assert.match(text, /Deals can change or sell out quickly\./);
  assert.ok(!/%|seat|miles|Alaska|Aeroplan|programme/i.test(text));
});

test('economy is answered honestly, never with business deals', async () => {
  const { c } = setup();
  const reply = await c.discover({ origin: 'Tokyo', cabin: 'economy' });
  assert.equal(reply.text, NO_ECONOMY_DEALS);
  assert.equal(c.publicState().pending, null);
});

test('business by default, first only when asked', async () => {
  const { c } = setup();
  assert.ok(!/Seoul/.test((await c.discover({ origin: 'Dubai' })).text), 'the first class deal is not in the default list');
  const first = await c.discover({ origin: 'Dubai', cabin: 'first' });
  assert.match(first.text, /Best first class deals from Dubai/);
  assert.deepEqual(listed(first.text), ['Seoul']);
});

test('region and budget filter the deals, and say so when nothing matches', async () => {
  const { c } = setup();
  assert.deepEqual(listed((await c.discover({ origin: 'London', region: 'Asia' })).text), ['Bangkok']);
  assert.deepEqual(listed((await c.discover({ origin: 'London', maxPriceUsd: 1000 })).text), ['Lisbon']);
  const none = await c.discover({ origin: 'London', region: 'Antarctica' });
  assert.match(none.text, /don’t have deals in Antarctica from London right now\. Here are the best deals instead\./);
  assert.ok(listed(none.text).length > 0);
});

test('a filter the deals cannot apply is declined in one line and the deals still show', async () => {
  const { c } = setup();
  const reply = await c.discover({ origin: 'Paris', aside: 'I can’t filter deals by weather.' });
  assert.match(reply.text, /I can’t filter deals by weather\./);
  assert.ok(listed(reply.text).length > 0);
});

// ---- Choosing a deal.
test('choosing a deal runs one live search for that exact route, date and cabin', async () => {
  const { adapter, c } = setup();
  await c.discover({ origin: 'New York' });
  const reply = await c.choose(2);
  const state = c.publicState();
  assert.equal(reply.status, 'results');
  assert.equal(state.origin.code, 'JFK');
  assert.equal(state.destination.code, 'BKK');
  assert.equal(state.dates.from, '2026-09-20');
  assert.equal(state.cabin, 'business');
  assert.equal(posts(adapter), 1);
  assert.match(reply.text, /commonswyft\.com\/search\/JFK-BKK-200926-business/);
  assert.ok(!/1,480|1,517/.test(reply.text.split('\n\n').slice(0, 2).join(' ')), 'the snapshot price is not carried into the search');
});

test('a deal that no longer shows is said plainly', async () => {
  const { c } = setup('nearby');
  await c.discover({ origin: 'London' });
  const reply = await c.choose(1);
  assert.match(reply.text, /^That exact deal isn’t showing now\. Here’s what’s available on that route\./);
});

test('the latest menu wins over an older deals menu', async () => {
  const { c } = setup();
  await c.discover({ origin: 'London' });
  await c.find({ destination: 'Sidney' });
  assert.equal(c.publicState().pending.field, 'destination');
});

// ---- The welcome.
test('the welcome shows the top three business class deals across departure cities', async () => {
  // Three, decided 2026-09-23 after seeing seven on the page.
  const { c } = setup();
  const offer = await c.welcomeDeals();
  assert.match(offer.text, /^Top deals/);
  const rows = offer.text.split('\n').filter(line => /^\d+\. /.test(line));
  assert.equal(rows.length, 3);
  assert.ok(rows.every(line => / → /.test(line)));
  assert.equal(offer.choices.length, 3);
});

test('the welcome has no deals section only when the feed is unavailable', async () => {
  assert.equal(await setup('deals-unavailable').c.welcomeDeals(), null);
  assert.ok((await setup('deals-past').c.welcomeDeals()).text, 'a stale feed still shows its deals');
});

test('a welcome deal can be chosen by number once the chat starts', async () => {
  const svc = createChatService({
    stagingFactory: () => Object.assign(makeFixtureAdapter('normal'), { snapshots: [] }),
    modelFactory: async () => ({ complete: async () => { throw new Error('no model call expected'); } }),
    preferenceStore: { label: 'test', read: async () => ({}), replace: async () => ({}) },
  });
  const welcome = await svc.welcome('staging-public');
  assert.match(welcome.text, /take me anywhere/);
  const deals = await svc.welcomeDeals('staging-public');
  assert.ok(deals.text && deals.key);
  const chat = await svc.start('staging-public', undefined, undefined, deals.key);
  const turn = await svc.turn(chat.id, '1');
  assert.equal(turn.result.status, 'results');
  assert.match(turn.result.text, /commonswyft\.com\/search\//);
});

test('an unknown welcome key offers nothing and chat starts normally', async () => {
  const svc = createChatService({
    stagingFactory: () => Object.assign(makeFixtureAdapter('normal'), { snapshots: [] }),
    modelFactory: async () => ({ complete: async () => { throw new Error('no model call expected'); } }),
    preferenceStore: { label: 'test', read: async () => ({}), replace: async () => ({}) },
  });
  const chat = await svc.start('staging-public', undefined, undefined, 'made-up-key');
  assert.equal(chat.dealsOffered, false);
  const turn = await svc.turn(chat.id, '1');
  assert.match(turn.result.text, /no active numbered menu/);
});

// ---- Contract with the model.
test('every field the discover tool advertises is accepted', async () => {
  const props = discoverTool.function.parameters.properties;
  const { c } = setup();
  const reply = await c.discover({ origin: 'London', cabin: props.cabin.enum[0], region: 'Europe', maxPriceUsd: 5000, aside: 'I can’t filter by weather.' });
  assert.equal(reply.status, 'deals');
  assert.deepEqual(Object.keys(props).sort(), ['aside', 'cabin', 'maxPriceUsd', 'origin', 'region'], 'a new field needs a test here');
  const bad = await setup().c.discover({ origin: 'London', destination: 'Paris' });
  assert.equal(bad.status, 'error');
});

test('recorded history keeps the deals a follow-up needs, not the prose', async () => {
  const { c } = setup();
  const compact = compactForHistory(await c.discover({ origin: 'London' }));
  assert.equal(compact.text, undefined);
  assert.deepEqual(Object.keys(compact.deals[0]).sort(), ['cabin', 'city', 'date', 'destination', 'origin', 'priceUsd']);
});

// Every Discover held-out case must be satisfiable by the intended tool call.
// Replaying that call through the real agent, conversation and grader catches
// a wrong expectation for free, before a paid run blames the model for it.
import { Agent } from '../model.mjs';
import { HARDENING_CASES_V2, HARDENING_V2_CLOCK } from '../hardening-cases-v2.mjs';
import { gradeV2Step } from '../hardening-v2.mjs';
const INTENDED = {
  'take me anywhere': {},
  'I’m in London, take me anywhere': { origin: 'London' },
  'anywhere from Tokyo in economy': { origin: 'Tokyo', cabin: 'economy' },
  'take me anywhere from New York': { origin: 'New York' },
  'somewhere warm from Paris': { origin: 'Paris', aside: 'I can’t filter deals by weather.' },
  'take me anywhere from London': { origin: 'London' },
  'anywhere from Aberdeen': { origin: 'Aberdeen' },
  'surprise me, I’m flying out of Tokyo': { origin: 'Tokyo' },
  'where can I go from Dubai in first class?': { origin: 'Dubai', cabin: 'first' },
  'take me anywhere in Asia from London': { origin: 'London', region: 'Asia' },
};
for (const item of HARDENING_CASES_V2.filter(c => c.category === 'Discover')) {
  test(`held-out ${item.id} is satisfiable by its intended call`, async () => {
    const adapter = makeFixtureAdapter(item.scenario ?? 'normal');
    const conversation = new SearchConversation({ adapter, today: () => HARDENING_V2_CLOCK });
    const preferences = { ...(item.initialPreferences ?? {}) };
    applyPreferences(conversation, preferences);
    const model = { complete: async messages => {
      const text = messages.at(-1).content;
      assert.ok(text in INTENDED, `no intended call recorded for "${text}"`);
      return { tool_calls: [{ id: 'ref', type: 'function', function: { name: 'discover_flights', arguments: JSON.stringify(INTENDED[text]) } }] };
    } };
    const agent = new Agent({ conversation, model, preferences });
    for (const step of item.steps) {
      const result = await agent.respond(step.text);
      const grade = gradeV2Step(step.expected, result, conversation, adapter, preferences);
      assert.ok(grade.pass, `${item.id} "${step.text}": ${JSON.stringify(grade.checks.filter(c => !c.pass))}`);
    }
  });
}

// Held-out G1-G11 all failed live: the model read the origin correctly but
// filled every other field with an empty value (region "", maxPriceUsd 0,
// aside ""), and validation rejected the zero budget. The reference replay
// above missed it because its calls were written the way a person would.
// These replay the calls the way the model actually sends them.
// G5 as the model actually sent it: the saved home airport copied in as origin.
const modelStyle = (intended, item) => ({ origin: item?.initialPreferences?.homeAirport ?? '', cabin: 'business', region: '', maxPriceUsd: 0, aside: '', ...intended });
for (const item of HARDENING_CASES_V2.filter(c => c.category === 'Discover')) {
  test(`held-out ${item.id} passes when the model fills every field`, async () => {
    const adapter = makeFixtureAdapter(item.scenario ?? 'normal');
    const conversation = new SearchConversation({ adapter, today: () => HARDENING_V2_CLOCK });
    const preferences = { ...(item.initialPreferences ?? {}) };
    applyPreferences(conversation, preferences);
    const model = { complete: async messages => ({ tool_calls: [{ id: 'ref', type: 'function', function: { name: 'discover_flights', arguments: JSON.stringify(modelStyle(INTENDED[messages.at(-1).content], item)) } }] }) };
    const agent = new Agent({ conversation, model, preferences });
    for (const step of item.steps) {
      const result = await agent.respond(step.text);
      const grade = gradeV2Step(step.expected, result, conversation, adapter, preferences);
      assert.ok(grade.pass, `${item.id} "${step.text}": ${JSON.stringify(grade.checks.filter(c => !c.pass))}`);
    }
  });
}

test('the exact arguments the model sent in the failed run now show deals', async () => {
  const { c } = setup();
  const reply = await c.discover({ origin: 'London', cabin: 'business', region: '', maxPriceUsd: 0, aside: '' });
  assert.equal(reply.status, 'deals');
  assert.match(reply.text, /deals from London/);
});

// Welcome copy agreed 2026-09-23: tagline, question, two examples, take me anywhere.
test('the welcome is the agreed short copy', async () => {
  const svc = createChatService({ stagingFactory: () => Object.assign(makeFixtureAdapter('normal'), { snapshots: [] }), modelFactory: async () => ({}),
    preferenceStore: { label: 'test', read: async () => ({}), replace: async () => ({}) } });
  const { text } = await svc.welcome('staging-public');
  assert.equal(text, 'Business class. Economy prices.\n\nWhere would you like to fly?\n\nTry “London to New York, first class” or “London to Singapore, business”.\n\nOr say “take me anywhere” and tell me where you’re flying from.');
});

// Staging's deals were all past-dated on 2026-09-23, so the real follow-up
// correctly shows nothing. A preview lets the layout be reviewed, labelled.
