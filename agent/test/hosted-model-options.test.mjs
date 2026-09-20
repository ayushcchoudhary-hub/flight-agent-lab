import test from 'node:test';
import assert from 'node:assert/strict';
import {HOSTED_MODEL_OPTIONS,hostedModelSettings} from '../hosted-model-options.mjs';

test('hosted experiment exposes only evaluated model and effort pairs',()=>{
 assert.deepEqual(HOSTED_MODEL_OPTIONS.map(({id,effort})=>[id,effort]),[
  ['openai/gpt-5.6-terra','medium'],
  ['deepseek/deepseek-v4.1-flash','low'],
 ['z-ai/glm-5.3','high'],
 ]);
 assert.equal(hostedModelSettings().model,'deepseek/deepseek-v4.1-flash');
 assert.equal(hostedModelSettings('deepseek/deepseek-v4.1-flash').effort,'low');
 assert.throws(()=>hostedModelSettings('deepseek/deepseek-v4.1-flash','high'),/evaluated model configurations/);
 assert.throws(()=>hostedModelSettings('openrouter/auto'),/evaluated model configurations/);
});
