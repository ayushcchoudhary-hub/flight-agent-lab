import test from 'node:test';
import assert from 'node:assert/strict';
import {requestCostUpperBound,validateCatalog} from '../openrouter-options.mjs';

const base={id:'model',name:'Model',canonical_slug:'model-2026',hugging_face_id:'org/model',supported_parameters:['tools','tool_choice','reasoning_effort'],reasoning:{supported_efforts:['low','high']},pricing:{prompt:'0.000001',completion:'0.000002'}};

test('catalog validation requires open weights, tools and declared effort support',()=>{
  const config={id:'x',model:'model',effort:'low',label:'Model low',family:'open weight'};
  assert.equal(validateCatalog([config],[base])[0].canonicalModel,'model-2026');
  assert.throws(()=>validateCatalog([{...config,effort:'medium'}],[base]),/does not support medium/);
  assert.throws(()=>validateCatalog([config],[{...base,hugging_face_id:null}]),/not identified as open weight/);
  assert.throws(()=>validateCatalog([config],[{...base,supported_parameters:['tool_choice','reasoning_effort']}]),/does not support tools/);
});

test('request budget uses the most expensive time-based price override',()=>{
  const config={pricing:{prompt:'0.000001',completion:'0.000002',overrides:[{prompt:'0.000003',completion:'0.000004'}]}};
  assert.ok(Math.abs(requestCostUpperBound(config,1000,100)-0.0034)<1e-12);
});
