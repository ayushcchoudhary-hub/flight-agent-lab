import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexModel, codexEnvironment } from '../codex-model.mjs';
import { Agent, PROMPT_VERSION } from '../model.mjs';
import { SearchConversation } from '../search.mjs';
import { makeFixtureAdapter } from '../fixtures.mjs';
import { gradeStep, EVAL_CASES, EVAL_CLOCK } from '../eval-cases.mjs';

function fakeClient(events, inspect=()=>{}) {
  return {startThread(options){inspect(options);return {async runStreamed(prompt,turn){
    assert.ok(prompt.includes('find_flights'));assert.equal(turn.outputSchema.additionalProperties,false);
    return {events:(async function*(){for(const e of events)yield e;})()};
  }}}};
}
const answer=(name,args)=>({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({name,arguments:JSON.stringify(args)})}});
const complete={type:'turn.completed',usage:{input_tokens:200,output_tokens:30,cached_input_tokens:0}};
test('Codex adapter translates structured output and records usage under read-only settings',async()=>{
  const events=[];const m=new CodexModel({maxCalls:1,trace:(type,data)=>events.push({type,data}),client:fakeClient([answer('find_flights',{origin:'London',destination:'New York'}),complete],o=>{
    assert.equal(o.model,'gpt-6-astra');assert.equal(o.sandboxMode,'read-only');assert.equal(o.networkAccessEnabled,false);assert.equal(o.webSearchMode,'disabled');
  })});
  const r=await m.complete([{role:'user',content:'London to New York'}]);
  assert.equal(r.tool_calls[0].function.name,'find_flights');
  assert.deepEqual(JSON.parse(r.tool_calls[0].function.arguments),{origin:'London',destination:'New York'});
  assert.equal(events.find(e=>e.type==='model_usage').data.usage.input_tokens,200);
  assert.equal(events.find(e=>e.type==='model_usage').data.promptVersion,PROMPT_VERSION);
  await assert.rejects(m.complete([]),/limit reached/);
});
test('Codex adapter rejects non-application activity and malformed output before search',async()=>{
  for(const event of [{type:'item.started',item:{type:'command_execution',command:'anything'}},answer('pay',{}),{type:'item.completed',item:{type:'agent_message',text:'Booked for $1'}}]){
    const api=makeFixtureAdapter();const c=new SearchConversation({adapter:api,today:()=>EVAL_CLOCK});
    const m=new CodexModel({client:fakeClient([event,complete])});
    const r=await new Agent({conversation:c,model:m}).respond('Find me a flight');
    assert.equal(r.status,'error');assert.equal(api.calls.length,0);
  }
});
test('Codex subprocess does not inherit API keys or app secrets',()=>{
  const env=codexEnvironment({HOME:'/home/test',PATH:'/bin',OPENAI_API_KEY:'secret',CODEX_API_KEY:'secret',OPENROUTER_API_KEY:'secret',DB_PASSWORD:'secret'});
  assert.deepEqual(env,{HOME:'/home/test',PATH:'/bin'});
});
test('Eval grader rejects wrong routes and missing clarification even if response sounds plausible',async()=>{
  const api=makeFixtureAdapter();const c=new SearchConversation({adapter:api,today:()=>EVAL_CLOCK});
  const result=await c.find({origin:'Dubai',destination:'London',dates:{mode:'exact',start:'2026-10-01'}});
  assert.equal(gradeStep(EVAL_CASES[0].steps[0].expected,result,c,api).pass,false);
  assert.equal(gradeStep({status:'clarify',posts:0},result,c,api).pass,false);
});
