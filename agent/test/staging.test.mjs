import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStagingAdapter, STAGING_BASE } from '../staging.mjs';
import { makeFixtureAdapter } from '../fixtures.mjs';
import { SearchConversation } from '../search.mjs';
import { verifyFlightData } from '../verify-flight-data.mjs';
import { Agent, ScriptedDemoModel } from '../model.mjs';

const query = { origin: 'LHR', destination: 'JFK', dateFrom: '2026-10-01', dateTo: '2026-10-01', selectedDate: '2026-10-01', cabin: 'business' };
async function mockTransport() {
  const snapshot = await makeFixtureAdapter().search(query);
  return { snapshot, fetchImpl: async request => {
    assert.equal(new URL(request.url).origin, new URL(STAGING_BASE).origin);
    assert.equal(request.headers.get('Authorization'), 'Bearer test-token');
    assert.equal(request.redirect, 'error');
    return Response.json(snapshot);
  }};
}
test('staging uses authenticated allowlisted POST + validated GET, without logging the bearer', async () => {
  const { fetchImpl } = await mockTransport();
  const adapter = makeStagingAdapter({ fetchImpl, getToken: async () => 'test-token', maxSearches: 1 });
  const response = await adapter.search(query);
  assert.equal(response.results.length, 3);
  assert.deepEqual(adapter.calls.map(c => c.method), ['POST','GET']);
  assert.ok(!JSON.stringify(adapter.calls).includes('test-token'));
  await assert.rejects(adapter.search(query), /limit/);
});
test('staging auth error is explicit and does not retry', async () => {
  let calls = 0;
  const adapter = makeStagingAdapter({ getToken: async () => 'expired', fetchImpl: async () => { calls++; return Response.json({}, { status: 401 }); } });
  await assert.rejects(adapter.search(query), /expired/);
  assert.equal(calls, 1);
});
test('staging any cabin follows frontend contract by omitting cabin', async () => {
  const { snapshot } = await mockTransport();
  const adapter = makeStagingAdapter({ getToken: async () => 'token', fetchImpl: async request => {
    if (request.method === 'POST') assert.equal('cabin' in await request.json(), false);
    return Response.json(snapshot);
  }});
  await adapter.search({ ...query, cabin: 'any' });
});
test('comparison polling retrieves only the existing search and stops at bound', async () => {
  const { snapshot } = await mockTransport();
  let posts = 0, gets = 0;
  const adapter = makeStagingAdapter({ getToken: async () => 'token', maxPolls: 2, wait: async () => {}, fetchImpl: async request => {
    request.method === 'POST' ? posts++ : gets++;
    return Response.json({ ...snapshot, comparisonStatus: 'pending', comparisonPollAfterMs: 1000, results: snapshot.results.map(r => ({ ...r, retailComparison: { ...r.retailComparison, status: 'pending' } })) });
  }});
  await adapter.search(query);
  assert.equal(posts, 1); assert.equal(gets, 3);
});
test('grounding catches price corruption; staging messages never claim synthetic data', async () => {
  const { fetchImpl } = await mockTransport();
  const adapter = makeStagingAdapter({ fetchImpl, getToken: async () => 'test-token' });
  const c = new SearchConversation({ adapter, today: () => '2026-09-18' });
  const result = await c.find({ origin: 'LHR', destination: 'JFK', dates: { mode: 'exact', start: '2026-10-01' } });
  assert.equal(result.dataMode, "staging"); assert.doesNotMatch(result.text, /STAGING|API search/); assert.doesNotMatch(result.text, /SYNTHETIC|simulated/);
  const valid = verifyFlightData(result, adapter.snapshots[0], query);
  assert.equal(valid.pass, true);
  result.shortlist[0].priceUsd++;
  assert.equal(verifyFlightData(result, adapter.snapshots[0], query).pass, false);
  const greeting = await new Agent({ conversation: c, model: new ScriptedDemoModel() }).respond('hi');
  assert.match(greeting.text, /Where would you like to fly/); assert.doesNotMatch(greeting.text, /SYNTHETIC/);
});

test('staging network errors are sanitized, with no automatic search retry', async () => {
  let calls = 0;
  const adapter = makeStagingAdapter({ getToken: async () => 'secret-token', fetchImpl: async () => { calls++; throw new Error('secret-token'); } });
  await assert.rejects(adapter.search(query), error => /creation failed/.test(error.message) && !error.message.includes('secret-token'));
  assert.equal(calls, 1);
});
test('safe status reads retry temporary failures but search creation never does', async () => {
  const snapshot = await makeFixtureAdapter().search(query);
  let posts = 0, gets = 0;
  const adapter = makeStagingAdapter({ getToken: async () => 'token', wait: async () => {}, fetchImpl: async request => {
    if (request.method === 'POST') { posts++; return Response.json(snapshot); }
    gets++;
    return gets === 1 ? Response.json({}, { status: 503 }) : Response.json(snapshot);
  }});
  const result = await adapter.search(query);
  assert.equal(result.searchId, snapshot.searchId);
  assert.equal(posts, 1);
  assert.equal(gets, 2);

  let failedPosts = 0;
  const creationFailure = makeStagingAdapter({ getToken: async () => 'token', wait: async () => {}, fetchImpl: async () => {
    failedPosts++;
    return Response.json({}, { status: 503 });
  }});
  await assert.rejects(creationFailure.search(query), /HTTP 503/);
  assert.equal(failedPosts, 1);
});
test('staging malformed response is rejected by the existing frontend validator', async () => {
  const { snapshot } = await mockTransport();
  snapshot.results[0].pricing.customerAmountUsd = 'wrong';
  const adapter = makeStagingAdapter({ getToken: async () => 'token', fetchImpl: async () => Response.json(snapshot) });
  await assert.rejects(adapter.search(query), /incompatible/);
});

test('explicit public search never reads credentials and preserves allowlist and response validation',async()=>{
 const snapshot=await makeFixtureAdapter().search(query);let requests=0;
 const a=makeStagingAdapter({authMode:'public',getToken:()=>{throw Error('Must not read account credentials');},fetchImpl:async request=>{requests++;assert.equal(request.headers.has('Authorization'),false);assert.equal(request.redirect,'error');return Response.json(snapshot);}});
 await a.search(query);assert.equal(requests,2);assert.equal(a.calls[0].authMode,'public');
});
test('public search denial does not switch identity or retry',async()=>{
 let calls=0;const a=makeStagingAdapter({authMode:'public',fetchImpl:async()=>{calls++;return Response.json({}, {status:401});}});
 await assert.rejects(a.search(query),/requires authentication/);assert.equal(calls,1);
 assert.throws(()=>makeStagingAdapter({authMode:'fallback'}),/Unknown/);
});
