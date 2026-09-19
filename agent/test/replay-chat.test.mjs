import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixtureAdapter } from '../fixtures.mjs';
import { makeReplayAdapter,queryKey } from '../replay.mjs';
import { createChatService } from '../chat-service.mjs';
import { ScriptedDemoModel } from '../model.mjs';
const emptyPreferenceStore={label:'empty test profile',read:async()=>({}),replace:async p=>p};
const chatService=options=>createChatService({preferenceStore:emptyPreferenceStore,...options});
const query={origin:'LHR|LGW|LCY|STN|LTN',destination:'JFK|EWR|LGA',dateFrom:'2026-09-19',dateTo:'2026-09-26',selectedDate:'2026-09-19',cabin:'business'};
const fixture=await makeFixtureAdapter().search(query);
// Synthetic data only within these unit tests; the interactive replay loads recorded staging captures.
const captures=[{clock:'2026-09-19',capturedAt:'2026-09-19T10:00:00Z',query,snapshot:fixture,input:'London to New York'}];
test('recording lookup ignores field order but preserves airport/date/cabin distinctions',async()=>{
 const a=makeReplayAdapter({captures});assert.equal(queryKey({...query}),queryKey(Object.fromEntries(Object.entries(query).reverse())));
 const first=await a.search(query);first.results.length=0;assert.equal((await a.search(query)).results.length,fixture.results.length);
 await assert.rejects(a.search({...query,cabin:'economy'}),/not recorded/);
 await assert.rejects(a.search({...query,origin:'LHR'}),/not recorded/);
});
test('recorded chat freezes the clock, labels data and verifies displayed fields',async()=>{
 const svc=chatService({capturesLoader:async()=>captures,modelFactory:()=>new ScriptedDemoModel(),status:async()=>({connected:false})});
 const s=await svc.start('replay');assert.equal(s.clock,'2026-09-19');
 const r=await svc.turn(s.id,'London to New York');assert.equal(r.result.status,'results');assert.equal(r.grounding.pass,true);assert.match(r.result.text,/Saved results/);assert.doesNotMatch(r.result.text,/New staging API search/);
 await assert.rejects(svc.start('staging'),/expired/);
 svc.close(s.id);await assert.rejects(svc.turn(s.id,'hello'),/expired/);
});
test('conversations do not share preferences, and unknown replay query never falls back',async()=>{
 const svc=chatService({capturesLoader:async()=>captures,modelFactory:()=>new ScriptedDemoModel()});
 const a=await svc.start('replay'),b=await svc.start('replay');await svc.turn(a.id,'London to New York');
 const r=await svc.turn(b.id,'economy instead');assert.equal(r.state.origin,null);assert.equal(r.state.cabin,'economy');
 const missing=await svc.turn(a.id,'economy instead');assert.equal(missing.result.status,'error');assert.match(missing.result.text,/not recorded/);
});
test('concurrent sends are rejected before an additional model call',async()=>{
 let release,entered;const ready=new Promise(r=>entered=r);let calls=0;
 const svc=chatService({capturesLoader:async()=>captures,modelFactory:()=>({complete:async messages=>{calls++;entered();await new Promise(r=>release=r);return new ScriptedDemoModel().complete(messages);}})});
 const s=await svc.start('replay');const running=svc.turn(s.id,'London to New York');await ready;
 await assert.rejects(svc.turn(s.id,'economy instead'),/still running/);assert.equal(calls,1);release();await running;
});
test('staging expiry is checked before invoking the model',async()=>{
 let connected=true,calls=0;const svc=chatService({status:async()=>({connected}),modelFactory:()=>({complete:()=>{calls++;}})});
 const s=await svc.start('staging');connected=false;await assert.rejects(svc.turn(s.id,'London to New York'),/expired/);assert.equal(calls,0);
});
test('each allowed model/effort reaches the model adapter and stays fixed for the chat',async()=>{
 const seen=[];const svc=chatService({capturesLoader:async()=>captures,modelFactory:(trace,settings)=>{seen.push(settings);return new ScriptedDemoModel();}});
 for(const model of ['gpt-6-astra','gpt-5.6-luna','gpt-5.6-sol','gpt-5.6-terra'])for(const effort of ['low','medium','high']){
  const s=await svc.start('replay',model,effort);assert.equal(s.model,model);assert.equal(s.effort,effort);
  const r=await svc.turn(s.id,'London to New York');assert.equal(r.settings.model,model);assert.equal(r.settings.effort,effort);svc.close(s.id);
 }
 assert.equal(seen.length,12);
 await assert.rejects(svc.start('replay','gpt-unknown','low'),/listed model/);
 await assert.rejects(svc.start('replay','gpt-6-astra','arbitrary'),/listed model/);
 assert.equal(seen.length,12);
});

test('public staging chat is explicitly anonymous and works independently of expired account connection',async()=>{
 let seen;const svc=chatService({status:async()=>({connected:false,reason:'expired'}),modelFactory:()=>new ScriptedDemoModel(),stagingFactory:options=>{seen=options;return {...makeFixtureAdapter(),snapshots:[]};}});
 const s=await svc.start('staging-public');assert.equal(seen.authMode,'public');assert.equal(s.mode,'staging-public');assert.doesNotMatch(s.text,/STAGING/);assert.match(s.text,/no booking or checkout/);
 const r=await svc.turn(s.id,'London to New York');assert.equal(r.result.status,'results');
 await assert.rejects(svc.start('staging'),/expired/);
});
