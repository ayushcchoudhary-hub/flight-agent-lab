import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchConversation } from '../search.mjs';
import { makeFixtureAdapter } from '../fixtures.mjs';
import { Agent, repairExplicitToolArguments } from '../model.mjs';
import { renderPolicyAnswer, retrievePolicy } from '../policy.mjs';

// Held-out v2 failures from the GPT-6 Sol head-to-head on 2026-09-23 (run
// live-hardening-judge-2026-09-23T09-53-41.562Z). Every tool call below is the
// one Sol actually sent. Sol fills tool fields with things the traveler never
// said, so these guards check each value against the traveler's own words.
const TODAY = '2026-09-18';
const setup = () => { const adapter = makeFixtureAdapter('normal'); return { adapter, c: new SearchConversation({ adapter, today: () => TODAY }) }; };
const call = (name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
const say = async (c, text, name, args) => new Agent({ conversation: c, model: { complete: async () => call(name, args) } }).respond(text);

// ---- Discover: region, budget, aside and origin must come from the traveler.

test('G2: a region and budget the traveler never mentioned are dropped', async () => {
  const { c } = setup();
  const r = await say(c, 'I’m in London, take me anywhere', 'discover_flights', { origin: 'London', cabin: 'business', region: 'Europe', maxPriceUsd: 1000, aside: 'I can’t filter deals by weather.' });
  assert.equal(r.status, 'deals');
  assert.match(r.text, /deals from London · checked/);
  assert.doesNotMatch(r.text, /Europe|1,000/);
});

test('G6: a weather word is not a region', async () => {
  const { c } = setup();
  const r = await say(c, 'somewhere warm from Paris', 'discover_flights', { origin: 'Paris', cabin: 'business', region: 'warm', maxPriceUsd: 0, aside: 'I can’t filter deals by weather.' });
  assert.equal(r.status, 'deals');
  assert.doesNotMatch(r.text, /in warm|don’t have deals/);
  assert.match(r.text, /I can’t filter deals by weather\./);
});

test('G8: "anywhere" is not a region', async () => {
  const { c } = setup();
  const r = await say(c, 'anywhere from Aberdeen', 'discover_flights', { origin: 'Aberdeen', cabin: 'business', region: 'anywhere', maxPriceUsd: 0, aside: '' });
  assert.match(r.text, /I don’t have deals from Aberdeen yet/);
  assert.doesNotMatch(r.text, /in anywhere/);
});

test('G7: a stray word, a USD 1 budget and a padded origin are repaired', async () => {
  const { c } = setup();
  const r = await say(c, 'take me anywhere from London', 'discover_flights', { origin: 'London scope', cabin: 'business', region: 'Europe', maxPriceUsd: 1, aside: 'hidden' });
  assert.match(r.text, /deals from London · checked/);
  assert.doesNotMatch(r.text, /hidden|scope|USD 1 |Europe/);
});

test('a region and budget the traveler did say are kept', () => {
  const kept = repairExplicitToolArguments('deals in Japan under $2,500 from London', 'discover_flights', { origin: 'London', region: 'Japan', maxPriceUsd: 2500 });
  assert.deepEqual([kept.region, kept.maxPriceUsd], ['Japan', 2500]);
  assert.equal(repairExplicitToolArguments('anything in south east asia from Tokyo', 'discover_flights', { region: 'South-East Asia' }).region, 'South-East Asia');
  assert.equal(repairExplicitToolArguments('europe, max 1.5k', 'discover_flights', { region: 'Europe', maxPriceUsd: 1500 }).maxPriceUsd, 1500);
});

// ---- Find: a garbled place is recovered from the traveler's own words.

test('D3: a garbled destination is recovered from what the traveler typed', async () => {
  const { c, adapter } = setup();
  const r = await say(c, 'from Gatwick to Singapore', 'find_flights', { origin: 'Gatwick', destination: 'SingaporeAirport (SIN)?', aside: '' });
  assert.equal(r.status, 'results');
  assert.equal(c.state.destination.code, 'SIN');
  assert.equal(adapter.calls.filter(x => x.method === 'POST').length, 1);
});

test('a place the model corrected is left alone', () => {
  assert.equal(repairExplicitToolArguments('nyc to lhr', 'find_flights', { origin: 'New York', destination: 'LHR' }).origin, 'New York');
  assert.equal(repairExplicitToolArguments('from the UK to Singapore', 'find_flights', { origin: 'the UK', destination: 'Singapore' }).origin, 'the UK');
});

// ---- Follow-ups: say only what the traveler asked about.

test('C1: a budget resent on an airport change is not announced', async () => {
  const { c } = setup();
  await say(c, 'London to New York 1 Oct economy under 700', 'find_flights', { origin: 'London', destination: 'New York', dates: { mode: 'exact', start: '2026-10-01' }, cabin: 'economy', maxPriceUsd: 700 });
  const r = await say(c, 'Gatwick only', 'find_flights', { origin: 'Gatwick', destination: '', maxPriceUsd: 700, aside: '' });
  assert.doesNotMatch(r.text, /Budget is already/);
  assert.match(r.text, /Up to USD 700/);
});

test('C6 still acknowledges a budget the traveler repeats', async () => {
  const { c } = setup();
  await say(c, 'London to New York 1 Oct under 700', 'find_flights', { origin: 'London', destination: 'New York', dates: { mode: 'exact', start: '2026-10-01' }, maxPriceUsd: 700 });
  const r = await say(c, 'keep it under 700', 'find_flights', { maxPriceUsd: 700 });
  assert.match(r.text, /Budget is already USD 700/);
});

test('C2: "cheapest first" is a sort, not a first-class request', async () => {
  const { c } = setup();
  await say(c, 'Singapore to London next week', 'find_flights', { origin: 'Singapore', destination: 'London', dates: { mode: 'nextWeek' } });
  const r = await say(c, 'ok cheapest first', 'find_flights', { origin: '', destination: '', cabin: 'business', cabinOnly: false, sort: 'cheapest', aside: '' });
  assert.doesNotMatch(r.text, /Already searching business class/);
  assert.match(r.text, /Business class \(default\)/);
  assert.equal(repairExplicitToolArguments('put me up front in first', 'find_flights', { cabin: 'first' }).cabin, 'first');
});

test('C1: the budget blocker quotes the cheapest fare on the date asked for', async () => {
  const { c } = setup();
  await say(c, 'London to New York 3 Oct economy under 700', 'find_flights', { origin: 'London', destination: 'New York', dates: { mode: 'exact', start: '2026-10-03' }, cabin: 'economy', maxPriceUsd: 700 });
  const blocked = await say(c, 'premium instead', 'find_flights', { cabin: 'premium' });
  const quoted = Number(blocked.text.match(/starts at USD (\d[\d,]*\d)/)[1].replaceAll(',', ''));
  const shown = await say(c, 'drop the budget', 'find_flights', { maxPriceUsd: null });
  const cheapest = Math.min(...shown.shortlist.filter(r => r.date === '2026-10-03').map(r => r.priceUsd));
  assert.equal(quoted, Math.round(cheapest));
});

test('C1: premium economy is named in full in the results header', async () => {
  const { c } = setup();
  const r = await say(c, 'London to New York 3 Oct premium economy', 'find_flights', { origin: 'London', destination: 'New York', dates: { mode: 'exact', start: '2026-10-03' }, cabin: 'premium' });
  assert.match(r.text, /· Premium economy · One-way/);
});

// ---- Menus say which part of the trip is kept.

test('A2 and B3: the kept-details line names the place already given', async () => {
  const a2 = setup().c;
  const menu = await say(a2, 'from the UK to Singapore on 3 Oct', 'find_flights', { origin: 'the UK', destination: 'Singapore', dates: { mode: 'exact', start: '2026-10-03' } });
  assert.match(menu.text, /I'll keep the flight to Singapore Changi Airport \(SIN\) · Business class · Sat, 3 Oct 2026 unless you change it\./);
  const b3 = setup().c;
  const ask = await say(b3, 'Leaving from Singapore on 5 Oct', 'find_flights', { origin: 'Singapore', destination: '', dates: { mode: 'exact', start: '2026-10-05' } });
  assert.match(ask.text, /I'll keep the flight from Singapore Changi Airport \(SIN\) · Business class · Mon, 5 Oct 2026/);
});

// ---- Policy: a refund question before booking does not ask for a booking.

test('C2: a general refund question gets a pre-booking handoff', () => {
  const evidence = retrievePolicy({ query: 'refund policy' });
  const general = renderPolicyAnswer({ answer: '', citations: [], needsSupport: true }, evidence, 'what is your refund policy?').text;
  assert.doesNotMatch(general, /booking reference/);
  assert.match(general, /before you book/);
  assert.match(renderPolicyAnswer({ answer: '', citations: [], needsSupport: true }, evidence, 'Is my ticket refundable?').text, /booking reference/);
});

// ---- Made-up values are guarded and counted, not hidden.

test('G9 (Terra): a cabin nobody mentioned is dropped from a deals request', async () => {
  const { c } = setup();
  const r = await say(c, 'surprise me, I’m flying out of Tokyo', 'discover_flights', { origin: 'Tokyo', cabin: 'economy', region: '', maxPriceUsd: 0, aside: '' });
  assert.equal(r.status, 'deals');
  assert.match(r.text, /business class deals from Tokyo/);
});

test('made-up values are counted per case even when a guard caught them', async () => {
  const { madeUpValues } = await import('../eval-story.mjs');
  const row = (input, events) => ({ steps: [{ input }], events });
  // Recorded before the guard existed: found by checking the tool call itself.
  assert.deepEqual(madeUpValues(row('I’m in London, take me anywhere', [{ type: 'tool_call', data: { name: 'discover_flights', arguments: { origin: 'London', region: 'Europe', maxPriceUsd: 1000 } } }])), ['region', 'maxPriceUsd']);
  // Recorded after: the call is already clean, so the guard's trace is counted.
  assert.deepEqual(madeUpValues(row('from Gatwick to Singapore', [
    { type: 'tool_argument_repair', data: { fields: ['destination'], reason: 'recovered a place name from the traveler’s own words' } },
    { type: 'tool_call', data: { name: 'find_flights', arguments: { origin: 'Gatwick', destination: 'Singapore' } } },
  ])), ['destination']);
  // Dropped defaults and resent dates are not inventions.
  assert.deepEqual(madeUpValues(row('Gatwick only', [
    { type: 'tool_argument_repair', data: { fields: ['cabin', 'sort'], reason: 'removed default values the current request did not ask for' } },
    { type: 'tool_argument_repair', data: { fields: ['dates'], reason: 'removed a value the current request did not mention' } },
  ])), []);
  // A clean call from the traveler's own words counts nothing.
  assert.deepEqual(madeUpValues(row('deals in Japan from London', [{ type: 'tool_call', data: { name: 'discover_flights', arguments: { origin: 'London', region: 'Japan' } } }])), []);
});
