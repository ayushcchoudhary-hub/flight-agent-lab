import test from 'node:test';
import assert from 'node:assert/strict';
import {retrievePolicy,renderPolicyAnswer,supportReply} from '../policy.mjs';
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
