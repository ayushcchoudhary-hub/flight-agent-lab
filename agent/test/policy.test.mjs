import test from 'node:test';
import assert from 'node:assert/strict';
import {retrievePolicy,renderPolicyAnswer,groundedPolicyAnswer,supportReply} from '../policy.mjs';
import {Agent} from '../model.mjs';
const evidence=retrievePolicy({query:'privacy'});
const call=(name,args)=>({role:'assistant',tool_calls:[{id:'test',type:'function',function:{name,arguments:JSON.stringify(args)}}]});
test('retrieval preserves analytics qualifications and terms placeholder',()=>{
 assert.ok(evidence.chunks.some(p=>p.text.includes('not automatically removed')));
 assert.ok(evidence.chunks.some(p=>p.document==='terms'&&p.text.includes('being finalized')));
 assert.throws(()=>retrievePolicy({query:'x',url:'https://example.com'}));
});
test('unsupported answers and fabricated citations fall back to support',()=>{
 assert.equal(renderPolicyAnswer({answer:'Refunds are free',citations:[],needsSupport:true},evidence).text,supportReply);
 assert.match(renderPolicyAnswer({answer:'',citations:[],needsSupport:true},evidence,'Is my ticket refundable?').text,/fare rules.*booking reference/i);
 assert.equal(renderPolicyAnswer({answer:'Refunds are free',citations:[{id:'privacy-1',quote:'Refunds are always free'}],needsSupport:false},evidence).text,supportReply);
});
test('valid answers link the policy while snapshot provenance stays internal',()=>{
 const p=evidence.chunks.find(p=>p.text.includes('card details'));
 const r=renderPolicyAnswer({answer:'Card details are handled by the payment provider; CommonSwyft does not store them.',citations:[{id:p.id,quote:'card details are handled by our payment provider and never stored by us.'}],needsSupport:false},evidence);
 assert.equal(r.sources.length,1);assert.match(r.text,/Privacy policy: https:\/\/staging.commonswyft.com\/privacy/);assert.doesNotMatch(r.text,/local copy|snapshot|;/i);assert.equal(r.policySnapshot,evidence.capturedAt);
});
test('customer-facing policy copy rejects internal implementation language',()=>{
 const p=evidence.chunks.find(p=>p.text.includes('card details'));
 const r=renderPolicyAnswer({answer:'The local copy says card details are not stored.',citations:[{id:p.id,quote:'card details are handled by our payment provider and never stored by us.'}],needsSupport:false},evidence);
 assert.equal(r.text,supportReply);assert.equal(r.sources.length,0);
});
test('customer-facing policy copy rejects abusive or consequential claims',()=>{
 const p=evidence.chunks.find(p=>p.text.includes('card details'));
 const citation=[{id:p.id,quote:'card details are handled by our payment provider and never stored by us.'}];
 assert.equal(renderPolicyAnswer({answer:'You are an idiot.',citations:citation,needsSupport:false},evidence).text,supportReply);
 assert.equal(renderPolicyAnswer({answer:'I refunded your card.',citations:citation,needsSupport:false},evidence).text,supportReply);
});
test('policy turn uses restricted generation tool and preserves trip and history',async()=>{
 const state={origin:'London',destination:'New York'};let calls=0;
 const model={async complete(messages,options){calls++;if(calls===1)return call('lookup_policy',{query:'card details'});
 assert.deepEqual(options.tools.map(t=>t.function.name),['policy_answer']);
 const p=evidence.chunks.find(p=>p.text.includes('card details'));
 return call('policy_answer',{answer:'The payment provider handles card details.',citations:[{id:p.id,quote:'card details are handled by our payment provider and never stored by us.'}],needsSupport:false});}};
 const conversation={adapter:{mode:'replay'},today:()=> '2026-09-19',publicState:()=>state,find:()=>{throw Error('Unexpected search')}};
 const agent=new Agent({conversation,model});
 assert.equal((await agent.respond('Do you store my card details?')).status,'policy');
 assert.equal(calls,2);assert.deepEqual(state,{origin:'London',destination:'New York'});assert.equal(agent.turns.length,1);
});
test('failed generation gives support handoff without executing search',async()=>{
 let n=0;const model={async complete(){if(n++)throw Error('outage');return call('lookup_policy',{query:'privacy'})}};
 const conversation={adapter:{mode:'replay'},today:()=> '2026-09-19',publicState:()=>({})};
 const result=await new Agent({conversation,model}).respond('privacy question');assert.equal(result.text,supportReply);
});
test('purchase-terms questions route to policy before action boundaries',async()=>{
 const queries=[];
 const model={async complete(messages,options){
  if(options?.tools?.[0]?.function?.name==='policy_answer')return call('policy_answer',{answer:'',citations:[],needsSupport:true});
  const user=messages.at(-1).content;queries.push(user);
  return call('lookup_policy',{query:user});
 }};
 const conversation={adapter:{mode:'replay'},today:()=> '2026-09-19',publicState:()=>({}),find:()=>{throw Error('Unexpected search')}};
 const agent=new Agent({conversation,model});
 const result=await agent.respond('What legal terms apply when I buy a ticket?');assert.equal(result.status,'policy');assert.match(result.text,/legal terms.*support@commonswyft\.com/i);
 assert.equal(queries.length,1);
});

// Held-out v2 E3 asked "do you sell my data?" and got the support handoff,
// although privacy-2 states plainly that details are not sold. An approved
// answer existed and the traveler did not receive it.
test('a data-sale question is answered from the snapshot, not deflected',()=>{
  for(const question of ['do you sell my data?','Do you sell my personal information?','will my details be sold?']){
    const answer=groundedPolicyAnswer(question);
    assert.ok(answer,`${question} must be answered from evidence`);
    assert.match(answer.text,/does not sell/i);
    assert.equal(answer.sources.length,1);
    assert.equal(answer.sources[0].id,'privacy-2');
    assert.ok(!/contact CommonSwyft support/i.test(answer.text),'must not deflect to support');
  }
});

// Held-out v2 E4 asked "how long do you keep my searches?" and got a bare
// support handoff, although privacy-7 and privacy-8 answer it. The retention
// question is no longer in the list below, because the snapshot does settle it.
test('a retention question is answered from the privacy snapshot',()=>{
  for(const question of ['how long do you keep my searches?','what is your retention period?','how long is my data stored?']){
    const answer=groundedPolicyAnswer(question);
    assert.ok(answer,`${question} must be answered from evidence`);
    assert.match(answer.text,/one year/);
    assert.match(answer.text,/30 days/);
    assert.match(answer.text,/search terms and travel details are not part of/);
    assert.match(answer.text,/Privacy policy: https:\/\//);
    assert.deepEqual(answer.sources.map(s=>s.id),['privacy-8','privacy-7']);
    assert.ok(!/contact CommonSwyft support/i.test(answer.text),'must not deflect to support');
    // No period the snapshot does not state.
    for(const period of answer.text.match(/\b\d+\s+(?:day|days|month|months|year|years)\b/g)??[])
      assert.ok(evidence.chunks.some(c=>c.text.toLowerCase().includes(period.toLowerCase())),`${period} is not in the snapshot`);
  }
});

test('a retention answer falls back to retrieval when the evidence changes',()=>{
  const stale={capturedAt:'2026-09-19',chunks:[
    {id:'privacy-8',url:'https://example.invalid/privacy',text:'Retention periods are under review.'},
    {id:'privacy-7',url:'https://example.invalid/privacy',text:'Analytics excludes search terms and travel details.'}]};
  assert.equal(groundedPolicyAnswer('how long do you keep my searches?',stale),null);
  const missingSupport={capturedAt:'2026-09-19',chunks:[evidence.chunks.find(c=>c.id==='privacy-8')]};
  assert.equal(groundedPolicyAnswer('how long do you keep my searches?',missingSupport),null);
});

test('a retention question about another subject is not given the analytics periods',()=>{
  for(const question of ['how long do you keep my card details?','how long do you store passport details?','how long do you keep my booking reference?']){
    assert.equal(groundedPolicyAnswer(question),null,`${question} has a different answer from analytics retention`);
  }
});

test('questions the snapshot does not settle still reach retrieval',()=>{
  for(const question of ['what is your refund policy?','do you store card details?','can I change my seat?']){
    assert.equal(groundedPolicyAnswer(question),null,`${question} must not be answered deterministically`);
  }
});

test('a grounded answer never outlives the passage it cites',()=>{
  // Snapshot rewritten so the quote no longer appears: fall back to retrieval
  // rather than keep asserting a claim the evidence no longer supports.
  const stale={capturedAt:'2026-09-19',chunks:[{id:'privacy-2',url:'https://example.invalid/privacy',text:'This copy no longer mentions that subject.'}]};
  assert.equal(groundedPolicyAnswer('do you sell my data?',stale),null);
});

test('a citation still counts when case, spacing or quote marks drift',()=>{
  const evidence=retrievePolicy({query:'privacy'});
  const quote='Card details are handled by our   payment provider and never stored by us.';
  const r=renderPolicyAnswer({answer:'Card details are handled by the payment provider and never stored.',citations:[{id:'privacy-2',quote}],needsSupport:false},evidence,'do you store card details?');
  assert.equal(r.sources.length,1,'a real quote must not be rejected over whitespace or case');
  assert.equal(r.sources[0].id,'privacy-2');
});

test('an invented quote is still rejected',()=>{
  const evidence=retrievePolicy({query:'privacy'});
  const r=renderPolicyAnswer({answer:'We publish a full refund guarantee.',citations:[{id:'privacy-2',quote:'we guarantee a full refund on every fare'}],needsSupport:false},evidence,'refunds?');
  assert.equal(r.sources.length,0);
  assert.match(r.text,/support/i);
});
