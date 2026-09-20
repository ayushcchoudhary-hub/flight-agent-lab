import test from 'node:test';
import assert from 'node:assert/strict';
import { repairExplicitToolArguments } from '../model.mjs';

// Held-out phrasings for the tool-argument repair layer. These were written
// after an external review found that the first version removed any field whose
// wording was missing from a keyword list. None of these phrasings appear in the
// model evaluation suites. The model output in each row is the correct
// interpretation, so the harness must not delete it.
const repair=(text,args)=>repairExplicitToolArguments(text,'find_flights',args);

const KEEP=[
  ['month abbreviation without a year','London to New York on Oct 5',{origin:'London',destination:'New York',dates:{mode:'exact',start:'2026-10-05'}}],
  ['day before month abbreviation','lhr to jfk 5 oct',{origin:'LHR',destination:'JFK',dates:{mode:'exact',start:'2026-10-05'}}],
  ['relative day count','Singapore to Dubai in 3 days',{origin:'Singapore',destination:'Dubai',dates:{mode:'exact',start:'2026-09-21'}}],
  ['weekend wording','Dubai to London this weekend',{origin:'Dubai',destination:'London',dates:{mode:'range',start:'2026-09-19',end:'2026-09-20'}}],
  ['fortnight wording','a fortnight from now, London to Singapore',{origin:'London',destination:'Singapore',dates:{mode:'exact',start:'2026-10-02'}}],
  ['cabin synonym','coach is fine',{cabin:'economy'}],
  ['cabin slang','put me up front in first',{cabin:'first'}],
  ['budget without a currency word','max 800',{maxPriceUsd:800}],
  ['budget with k suffix','cap it at 1.2k',{maxPriceUsd:1200}],
  ['sort synonym','show me the quickest',{sort:'fastest'}],
  ['sort by cost wording','what costs the least?',{sort:'cheapest'}],
  ['nonstop synonym','no layovers',{nonstopOnly:true}],
  ['nonstop stop wording','zero stops please',{nonstopOnly:true}],
  ['refresh synonym','is that still available?',{refresh:true}],
];

for(const [name,text,args] of KEEP)test(`held-out: keeps a correct interpretation (${name})`,()=>{
  assert.deepEqual(repair(text,args),args);
});

// The failure the repair layer exists for: a model resends the whole trip with
// application defaults during a follow-up. Those defaults must not reset choices
// the traveler made earlier.
const DEFAULT_RESET={dates:{mode:'rolling'},cabin:'business',cabinOnly:false,sort:'recommended',nonstopOnly:false,maxPriceUsd:null,refresh:false};
const DROP_RESET=[
  ['airport refinement','Gatwick instead',{origin:'LGW'}],
  ['destination change','actually make it Newark',{destination:'EWR'}],
  ['lower-case airport code','from lcy',{origin:'LCY'}],
];
for(const [name,text,patch] of DROP_RESET)test(`held-out: drops an unrequested reset to defaults (${name})`,()=>{
  assert.deepEqual(repair(text,{...patch,...DEFAULT_RESET}),patch);
});

test('held-out: a default value is kept when the traveler asks for it',()=>{
  assert.deepEqual(repair('business instead',{cabin:'business'}),{cabin:'business'});
  assert.deepEqual(repair('no budget limit',{maxPriceUsd:null}),{maxPriceUsd:null});
  assert.deepEqual(repair('any time in the coming week',{dates:{mode:'rolling'}}),{dates:{mode:'rolling'}});
  assert.deepEqual(repair('stops are fine',{nonstopOnly:false}),{nonstopOnly:false});
});

test('held-out: kept fields without wording evidence are traced for review',()=>{
  const events=[];
  repairExplicitToolArguments('coach is fine','find_flights',{cabin:'economy'},(type,data)=>events.push({type,data}));
  assert.deepEqual(events,[{type:'tool_argument_unverified',data:{fields:['cabin'],reason:'kept a non-default value with no matching wording in the current request'}}]);
});

test('held-out: a resent copy of the current trip is kept without a review trace',()=>{
  const events=[],trip={cabin:'economy',maxPriceUsd:600,sort:'recommended',nonstopOnly:false,cabinOnly:false,dates:{from:'2026-10-01',to:'2026-10-01'}};
  const args={origin:'LHR',cabin:'economy',maxPriceUsd:600,dates:{mode:'exact',start:'2026-10-01'}};
  assert.deepEqual(repairExplicitToolArguments('Heathrow only please','find_flights',args,(type,data)=>events.push({type,data}),trip),args);
  assert.deepEqual(events,[]);
  repairExplicitToolArguments('Heathrow only please','find_flights',{origin:'LHR',nonstopOnly:true},(type,data)=>events.push({type,data}),trip);
  assert.deepEqual(events.map(e=>[e.type,e.data.fields]),[['tool_argument_unverified',['nonstopOnly']]]);
});
