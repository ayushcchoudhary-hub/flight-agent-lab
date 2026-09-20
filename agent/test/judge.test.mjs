import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJudgeOutput} from '../judge.mjs';

test('judge parser accepts strict JSON, fenced JSON and provider text parts',()=>{
 const value={verdict:'pass'};
 assert.deepEqual(parseJudgeOutput(JSON.stringify(value)),value);
 assert.deepEqual(parseJudgeOutput('```json\n'+JSON.stringify(value)+'\n```'),value);
 assert.deepEqual(parseJudgeOutput([{type:'text',text:JSON.stringify(value)}]),value);
 assert.throws(()=>parseJudgeOutput('not json'));
});
