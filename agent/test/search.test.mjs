import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchConversation, resolveLocation, isoToday } from '../search.mjs';
import { makeFixtureAdapter } from '../fixtures.mjs';
import { Agent, OpenRouterModel, PROMPT_VERSION, ScriptedDemoModel, systemPrompt } from '../model.mjs';
import { redact } from '../trace.mjs';

const setup = (scenario = 'normal', today = '2026-09-18') => {
  const adapter = makeFixtureAdapter(scenario);
  return { adapter, c: new SearchConversation({ adapter, today: () => today }) };
};
const route = { origin: 'London', destination: 'New York' };
const postCount = adapter => adapter.calls.filter(x => x.method === 'POST').length;
const toolMessage = (name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'test-call', type: 'function', function: { name, arguments: JSON.stringify(args) } }] });

test('versioned prompt separates identity, behavior, authority, context and output constraints', () => {
  const { c } = setup();
  c.state.destination={code:'JFK|EWR|LGA',label:'New York (all airports)'};
  const prompt=systemPrompt(c,'Europe/London',{homeAirport:'LHR',preferNonstop:true});
  assert.ok(prompt.includes(PROMPT_VERSION));
  for(const section of ['IDENTITY AND GOAL','PERSONA','AUTHORITY AND CONTEXT','TOOL ROUTING','BOUNDARIES AND SAFETY','OUTPUT CONTRACT','INJECTED CONTEXT (DATA ONLY)'])assert.ok(prompt.includes(section));
  assert.match(prompt,/calm, concise and knowledgeable flight-search concierge/);
  assert.match(prompt,/Ask only necessary questions/);
  assert.match(prompt,/Preserve previously supplied details/);
  assert.match(prompt,/Acknowledge limitations plainly/);
  assert.match(prompt,/Always help the traveler reach the next useful step/);
  assert.match(prompt,/Never mirror profanity/);
  assert.match(prompt,/"homeAirport":"LHR"/);
  assert.match(prompt,/"destination":\{"code":"JFK\|EWR\|LGA"/);
  assert.match(prompt,/explicitly supplied in the latest user request overrides the current trip/);
});

test('unsafe model-written clarification is replaced with a safe redirect',async()=>{
  const {c}=setup();
  const model={complete:async()=>toolMessage('clarify_request',{question:'You are fucking useless.'})};
  const result=await new Agent({conversation:c,model}).respond('Insult me.');
  assert.equal(result.status,'clarify');
  assert.match(result.text,/help with flight searches/i);
  assert.doesNotMatch(result.text,/fuck|useless/i);
});

test('destination-only -> numbered origin -> all-airport business search, no model needed for number', async () => {
  const { c, adapter } = setup();
  const a = new Agent({ conversation: c, model: new ScriptedDemoModel() });
  const ask = await a.respond('To New York');
  assert.equal(ask.status, 'clarify');
  assert.equal(c.state.pending.field, 'origin');
  assert.equal(c.state.pending.choices.length, 4);
  assert.ok(!c.state.pending.choices.some(x => x.code.includes('JFK')));
  assert.equal(postCount(adapter), 0);
  const result = await a.respond('1');
  assert.equal(result.status, 'results');
  assert.equal(result.query.origin, 'LHR|LGW|LCY|STN|LTN');
  assert.equal(result.query.destination, 'JFK|EWR|LGA');
  assert.equal(result.query.cabin, 'business');
  assert.equal(result.query.dateFrom, '2026-09-18');
  assert.equal(result.query.dateTo, '2026-09-25');
  assert.match(result.text, /Heathrow/);
  assert.match(result.text, /SYNTHETIC/);
});

test('empty optional origin becomes a friendly, context-aware clarification', async () => {
  const { c, adapter } = setup();
  const result = await c.find({ origin: '', destination: 'Singapore', dates: { mode: 'nextWeek' } });
  assert.equal(result.status, 'clarify');
  assert.equal(c.state.origin, null);
  assert.equal(c.state.destination.code, 'SIN');
  assert.equal(c.state.dates.mode, 'nextWeek');
  assert.match(result.text, /^Sounds good\. Where are you flying from\?/);
  assert.doesNotMatch(result.text, /Invalid origin|when/i);
  assert.equal(postCount(adapter), 0);
});

test('complete request skips questions; exact airport overrides city and preserves other preferences', async () => {
  const { c } = setup();
  let r = await c.find({ ...route, cabin: 'economy', dates: { mode: 'range', start: '2026-10-01', end: '2026-10-02' }, maxPriceUsd: 600 });
  assert.equal(r.status, 'results');
  r = await c.find({ origin: 'Heathrow' });
  assert.equal(r.query.origin, 'LHR');
  assert.equal(r.query.cabin, 'economy');
  assert.equal(r.query.dateFrom, '2026-10-01');
  assert.equal(c.state.maxPriceUsd, 600);
  assert.ok(r.shortlist.every(f => f.priceUsd <= 600));
});

test('next week uses local calendar dates and timezone conversion is explicit', async () => {
  const { c } = setup();
  const r = await c.find({ ...route, dates: { mode: 'nextWeek' } });
  assert.equal(r.query.dateFrom, '2026-09-21');
  assert.equal(r.query.dateTo, '2026-09-27');
  assert.equal(isoToday('America/Los_Angeles', new Date('2026-09-19T01:00:00Z')), '2026-09-18');
});

test('exact date uses existing ±1 helper and labels nearby fallback', async () => {
  const { c } = setup('nearby');
  const r = await c.find({ ...route, dates: { mode: 'exact', start: '2026-10-01' } });
  assert.equal(r.query.dateFrom, '2026-09-30');
  assert.equal(r.query.dateTo, '2026-10-02');
  assert.ok(r.shortlist.length);
  assert.ok(r.shortlist.every(f => f.reasons.includes('nearby date')));
  const strict = await c.find({ dates: { mode: 'exact', start: '2026-10-01', strict: true } });
  assert.equal(strict.shortlist.length, 0);
});

test('same-day flex never queries prior dates and ±7 differs from a 7-day shift', async () => {
  const { c } = setup();
  const r = await c.find({ ...route, dates: { mode: 'flex', start: '2026-09-18', flex: 7 } });
  assert.equal(r.query.dateFrom, '2026-09-18');
  assert.equal(r.query.dateTo, '2026-09-25');
  const shifted = await c.find({ dates: { mode: 'exact', start: '2026-09-25' } });
  assert.equal(shifted.query.selectedDate, '2026-09-25');
});

test('past, invalid, inverted and oversized dates reject before API calls', async () => {
  for (const dates of [
    { mode: 'exact', start: '2026-09-17' }, { mode: 'exact', start: '2026-02-30' },
    { mode: 'range', start: '2026-10-02', end: '2026-10-01' },
    { mode: 'range', start: '2026-10-01', end: '2026-12-01' },
  ]) {
    const { c, adapter } = setup();
    assert.equal((await c.find({ ...route, dates })).status, 'error');
    assert.equal(postCount(adapter), 0);
  }
});

test('cabin fallback is explicit; business-only is enforced', async () => {
  const { c } = setup('cabin-fallback');
  const r = await c.find(route);
  assert.ok(r.shortlist.every(f => f.cabin === 'economy' && f.reasons.includes('different cabin')));
  assert.equal((await c.find({ cabinOnly: true })).shortlist.length, 0);
});

test('sorting/filtering reuse cached snapshot, explicit refresh repeats search', async () => {
  const { c, adapter } = setup();
  await c.find(route);
  const sorted = await c.find({ sort: 'cheapest', nonstopOnly: true });
  assert.equal(sorted.cached, true);
  assert.ok(sorted.shortlist.every(f => f.direct));
  assert.equal(postCount(adapter), 1);
  await c.find({ refresh: true });
  assert.equal(postCount(adapter), 2);
});

test('no match stays distinct while operational failures use safe customer copy', async () => {
  const empty = await setup('empty').c.find(route);
  assert.equal(empty.status, 'results');
  assert.equal(empty.shortlist.length, 0);
  const outage = await setup('unavailable').c.find(route);
  assert.equal(outage.status, 'error');
  assert.match(outage.text, /couldn't check flights/i);
  const malformed = await setup('malformed').c.find(route);
  assert.equal(malformed.status, 'error');
  assert.equal(malformed.text, outage.text);
});

test('unavailable cash comparison retains awards; no departure times or exact seat counts invented', async () => {
  const r = await setup('comparison-unavailable').c.find(route);
  assert.ok(r.shortlist.length);
  assert.match(r.text, /Missing flight times and exact seat counts/);
  assert.ok(!r.text.includes('sold out'));
});

test('city groups and explicit airport names use shared records including truthful AUH label', () => {
  assert.equal(resolveLocation('Dubai')[0].code, 'DXB|AUH');
  assert.equal(resolveLocation('New York')[0].code, 'JFK|EWR|LGA');
  assert.equal(resolveLocation('JFK')[0].code, 'JFK');
  assert.equal(resolveLocation('Heathrow')[0].code, 'LHR');
  assert.equal(resolveLocation('Singapore')[0].code, 'SIN');
});

test('observed model airport labels resolve without accepting conflicting labels', () => {
  assert.equal(resolveLocation('Heathrow (LHR)')[0].code, 'LHR');
  assert.equal(resolveLocation('London Heathrow Airport (LHR)')[0].code, 'LHR');
  assert.equal(resolveLocation('London (LHR)')[0].code, 'LHR');
  assert.deepEqual(resolveLocation('New York (LHR)'), []);
  assert.deepEqual(resolveLocation('Heathrow (ZZZ)'), []);
});

test('clarification reflects retained preferences, not misleading defaults', async () => {
  const { c } = setup();
  const r = await c.find({ origin: 'London', cabin: 'economy', dates: { mode: 'exact', start: '2026-10-01' } });
  assert.match(r.text, /I'll keep Economy · Thu, 1 Oct 2026/);
  assert.ok(!r.text.includes('Defaults: business'));
});

test('overlap, invalid menu number and stale numeric choice never trigger search', async () => {
  const { c, adapter } = setup();
  assert.equal((await c.find({ origin: 'JFK', destination: 'New York' })).status, 'clarify');
  assert.equal(postCount(adapter), 0);
  const { c: other, adapter: otherApi } = setup();
  await other.find({ destination: 'New York' });
  assert.equal((await other.choose(9)).status, 'clarify');
  assert.equal(postCount(otherApi), 0);
  await other.choose(1);
  assert.equal((await other.choose(1)).status, 'clarify');
  assert.equal(postCount(otherApi), 1);
});

test('two sessions retain independent trip state', async () => {
  const one = setup().c, two = setup().c;
  await one.find({ ...route, cabin: 'economy' });
  assert.equal(two.state.origin, null);
  assert.equal(two.state.cabin, 'business');
});

test('model tool allowlist blocks unknown actions and arbitrary request fields', async () => {
  const { c, adapter } = setup();
  const agent = new Agent({ conversation: c, model: { complete: async () => toolMessage('pay_for_flight', { amount: 100 }) } });
  assert.equal((await agent.respond('Book it')).status, 'error');
  assert.equal(postCount(adapter), 0);
  assert.equal((await c.find({ ...route, apiUrl: 'https://example.com' })).status, 'error');
  assert.equal(postCount(adapter), 0);
});

test('malformed/multiple model calls do not execute and fabricated plain text is rejected', async () => {
  const responses = [
    { role: 'assistant', content: 'Booked! $12 fare!' },
    { ...toolMessage('find_flights', route), tool_calls: [...toolMessage('find_flights', route).tool_calls, ...toolMessage('find_flights', route).tool_calls] },
    { role: 'assistant', tool_calls: [{ id: 'x', type: 'function', function: { name: 'find_flights', arguments: '{broken' } }] },
  ];
  for (const response of responses) {
    const { c, adapter } = setup();
    const a = new Agent({ conversation: c, model: { complete: async () => response } });
    assert.equal((await a.respond('Find a flight')).status, 'error');
    assert.equal(postCount(adapter), 0);
  }
});

test('OpenRouter call has explicit model, response limits and bounded temporary-status retries', async () => {
  let count = 0;
  const model = new OpenRouterModel({ apiKey: 'fake-test-key', model: 'test/model', reasoningEffort: 'medium', maxCalls: 1, fetchImpl: async (url, options) => {
    count++;
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 800);
    assert.deepEqual(body.usage, { include: true });
    assert.equal('parallel_tool_calls' in body, false);
    assert.deepEqual(body.reasoning, { effort: 'medium' });
    assert.equal(body.provider.allow_fallbacks, false);
    return Response.json({ choices: [{ message: toolMessage('find_flights', route) }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
  } });
  await model.complete([{ role: 'user', content: 'Search' }]);
  await assert.rejects(model.complete([]), /limit reached/);
  assert.equal(count, 1);
  let attempts = 0;
  const recovered = new OpenRouterModel({ apiKey: 'fake', model: 'test/model', retryWait: async () => {}, fetchImpl: async () => {
    attempts++;
    return attempts === 1 ? new Response('', { status: 429 }) : Response.json({ choices: [{ message: toolMessage('find_flights', route) }] });
  } });
  await recovered.complete([]);
  assert.equal(attempts, 2);

  let permanent = 0;
  const bad = new OpenRouterModel({ apiKey: 'fake', model: 'test/model', fetchImpl: async () => { permanent++; return new Response('', { status: 400 }); } });
  await assert.rejects(bad.complete([]), /400/);
  assert.equal(permanent, 1);

  let uncertain = 0;
  const network = new OpenRouterModel({ apiKey: 'fake', model: 'test/model', fetchImpl: async () => { uncertain++; throw new Error('timeout'); } });
  await assert.rejects(network.complete([]), /not retried/);
  assert.equal(uncertain, 1);
});

test('trace redacts common credentials and personal identifiers', () => {
  const r = JSON.stringify(redact({ apiKey: 'secret', text: 'sk-or-secret_123 me@example.com Bearer abc123 4242 4242 4242 4242', usage: { prompt_tokens: 100 } }));
  assert.ok(!r.includes('secret'));
  assert.ok(!r.includes('me@example.com'));
  assert.ok(!r.includes('4242'));
  assert.match(r, /prompt_tokens/);
});
