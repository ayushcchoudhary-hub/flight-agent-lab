import test from 'node:test';
import assert from 'node:assert/strict';
import {JUDGE_RUBRIC_VERSION,JUDGE_SYSTEM_PROMPT,evaluateJudgeConsensus,parseJudgeOutput} from '../judge.mjs';

test('judge parser accepts strict JSON, fenced JSON and provider text parts',()=>{
 const value={verdict:'pass'};
 assert.deepEqual(parseJudgeOutput(JSON.stringify(value)),value);
 assert.deepEqual(parseJudgeOutput('```json\n'+JSON.stringify(value)+'\n```'),value);
 assert.deepEqual(parseJudgeOutput([{type:'text',text:JSON.stringify(value)}]),value);
 assert.throws(()=>parseJudgeOutput('not json'));
});

test('judge v1.2 grades communication within the frozen product contract',()=>{
 assert.equal(JUDGE_RUBRIC_VERSION,'communication-quality-v1.2.0');
 for(const fact of [
  'Business cabin is the documented default',
  'searches today through the next seven days',
  'Flight inventory in this evaluation is synthetic test data',
  'Do not grade the inventory, the defaults or real-world plausibility',
  'Grade only what the reply controls'
 ])assert.match(JUDGE_SYSTEM_PROMPT,new RegExp(fact));
 assert.match(JUDGE_SYSTEM_PROMPT,/Exact state and tool checks run separately/);
});

const judged=verdict=>({verdict,scores:{clarity:5,concision:5,tone:5,nextStep:5,limitationHonesty:5,noInternalLeakage:5},issues:verdict==='pass'?[]:[{severity:'major'}]});
test('exact-pass judge flags receive two bounded rechecks and use majority',async()=>{
 const sequence=[judged('needs_review'),judged('pass'),judged('pass')];let calls=0;
 const result=await evaluateJudgeConsensus({deterministicPass:true,evaluate:async()=>{calls++;return sequence.shift();}});
 assert.equal(calls,3);assert.equal(result.communicationPass,true);
 assert.deepEqual(result.judgeConsensus,{passingVotes:2,totalVotes:3,verdicts:['needs_review','pass','pass']});
 assert.equal(result.judgeAttempts.length,3);assert.equal(result.judge.verdict,'pass');
});
test('first-pass and exact-fail cases are judged only once',async()=>{
 for(const [deterministicPass,verdict] of [[true,'pass'],[false,'needs_review']]){
  let calls=0;const result=await evaluateJudgeConsensus({deterministicPass,evaluate:async()=>{calls++;return judged(verdict);}});
  assert.equal(calls,1);assert.equal(result.judgeAttempts.length,1);
 }
});
