import test from 'node:test';
import assert from 'node:assert/strict';
import {JUDGE_RUBRIC_VERSION,JUDGE_SYSTEM_PROMPT,parseJudgeOutput} from '../judge.mjs';

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
