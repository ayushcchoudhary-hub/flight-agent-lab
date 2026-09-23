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

// The cabin expectation was narrowed on 2026-09-22. A resent cabin still sets
// the same value, but now marks the cabin as stated, so a saved or assumed
// default would stop being disclosed. It is dropped when the request has no
// cabin wording. Every other resent field is still passed through untraced.
// A resent copy changes nothing, so it is dropped rather than kept: keeping it
// made the reply announce "Budget is already USD 700" for a request that never
// mentioned the budget (held-out C1, GPT-6 Sol, 2026-09-23).
test('held-out: a resent copy of the current trip is dropped without a review trace',()=>{
  const events=[],trip={cabin:'economy',maxPriceUsd:600,sort:'recommended',nonstopOnly:false,cabinOnly:false,dates:{from:'2026-10-01',to:'2026-10-01'}};
  const args={origin:'LHR',cabin:'economy',maxPriceUsd:600,dates:{mode:'exact',start:'2026-10-01'}};
  assert.deepEqual(repairExplicitToolArguments('Heathrow only please','find_flights',args,(type,data)=>events.push({type,data}),trip),{origin:'LHR'});
  assert.deepEqual(events,[]);
  repairExplicitToolArguments('Heathrow only please','find_flights',{origin:'LHR',nonstopOnly:true},(type,data)=>events.push({type,data}),trip);
  assert.deepEqual(events.map(e=>[e.type,e.data.fields]),[['tool_argument_unverified',['nonstopOnly']]]);
});

// Held-out v2 C2: "nonstop only" arrived with dates=24 Sept, invented by the
// model, and collapsed a week-long search to one day for the rest of the
// conversation. The layer already flagged it as unverified; it now removes it.
const WEEK={dates:{mode:'nextWeek',from:'2026-09-21',to:'2026-09-27'}};
test('a date the request never mentions is removed',()=>{
  const events=[];
  const out=repairExplicitToolArguments('nonstop only','find_flights',{dates:{mode:'exact',start:'2026-09-24'},nonstopOnly:true},(type,data)=>events.push({type,data}),WEEK);
  assert.deepEqual(out,{nonstopOnly:true});
  assert.ok(events.some(e=>e.data.reason==='removed a value the current request did not mention'));
});

test('any time expression counts as date wording',()=>{
  for(const text of ['next week please','5 oct','this weekend','a fortnight from now','2/10','make it the 3rd','in 3 days','tomorrow','sat or sun']){
    assert.ok('dates' in repairExplicitToolArguments(text,'find_flights',{dates:{mode:'exact',start:'2026-10-05'}},()=>{},WEEK),`${text} mentions a date`);
  }
});

test('answering an open date menu keeps the date',()=>{
  const trip={...WEEK,pending:{field:'dates',choices:[]}};
  assert.ok('dates' in repairExplicitToolArguments('the first one','find_flights',{dates:{mode:'exact',start:'2026-10-02'}},()=>{},trip));
});

// Held-out v2 D2: the prompt shows the saved home airport, so the model copied
// it into the call as if typed, and the disclosure never fired.
const HOME={originFromPreference:true,origin:{code:'LHR',label:'London Heathrow Airport (LHR)'}};
test('a copied home airport stays a default',()=>{
  const out=repairExplicitToolArguments('to Singapore next week','find_flights',{origin:'London Heathrow Airport (LHR)',destination:'Singapore'},()=>{},HOME);
  assert.equal('origin' in out,false);
  assert.equal(out.destination,'Singapore');
});
test('a home airport the traveler names is theirs',()=>{
  for(const text of ['from Heathrow to Singapore','LHR to Singapore','London to Singapore']){
    assert.ok('origin' in repairExplicitToolArguments(text,'find_flights',{origin:'LHR',destination:'Singapore'},()=>{},HOME),`${text} names the origin`);
  }
});

// Held-out C1, 2026-09-23 head-to-head: "Gatwick only" arrived with cabin
// "any" and the search widened to every cabin.
test('a cabin the request never mentions is removed; a cabin synonym is kept',()=>{
  const trip={cabin:'economy',dates:{from:'2026-10-01',to:'2026-10-01'}};
  assert.equal('cabin' in repairExplicitToolArguments('Gatwick only','find_flights',{origin:'Gatwick',cabin:'any'},()=>{},trip),false);
  assert.equal(repairExplicitToolArguments('coach is fine','find_flights',{cabin:'economy'},()=>{},{cabin:'business'}).cabin,'economy');
  assert.equal(repairExplicitToolArguments('any cabin is fine','find_flights',{cabin:'any'},()=>{},trip).cabin,'any');
});

// Held-out G5: discover_flights received the saved home "LHR" copied from the
// prompt, so the deals reply never said the saved home airport was used.
test('a home airport copied into discover_flights stays a default',()=>{
  const trip={originFromPreference:true,origin:{code:'LHR',label:'London Heathrow Airport (LHR)'}};
  assert.equal('origin' in repairExplicitToolArguments('take me anywhere','discover_flights',{origin:'LHR',cabin:'business',region:''},()=>{},trip),false);
  assert.equal(repairExplicitToolArguments('take me anywhere from Heathrow','discover_flights',{origin:'LHR'},()=>{},trip).origin,'LHR');
  assert.equal(repairExplicitToolArguments('take me anywhere from Tokyo','discover_flights',{origin:'Tokyo'},()=>{},trip).origin,'Tokyo');
});
