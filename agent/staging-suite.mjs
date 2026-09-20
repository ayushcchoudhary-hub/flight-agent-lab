import { mkdirSync,writeFileSync,readFileSync,renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { makeStagingAdapter,readStagingToken } from './staging.mjs';
import { SearchConversation,isoToday } from './search.mjs';
import { Agent, OpenRouterModel, PROMPT_VERSION } from './model.mjs';

import { shiftIso } from './shared.mjs';
import { gradeStep,CITY_CODES } from './eval-cases.mjs';
import { verifyFlightData } from './verify-flight-data.mjs';
if(!process.argv.includes('--staging')) throw new Error('Use --staging for the bounded, search-only integration suite.');
await readStagingToken();
const clock=isoToday(),date=shiftIso(clock,14),rollingEnd=shiftIso(clock,7),model='openai/gpt-5.6-terra',effort='medium';
const trip=(origin='London',destination='New York',from=date,to=date,posts=1)=>({status:'results',origin:CITY_CODES[origin],destination:CITY_CODES[destination],cabin:'business',from,to,posts});
const cases=[
 {id:'S1',name:'Complete request → real flight search',description:'Both cities, exact date, business. Check interpretation and every displayed offer against the API; availability itself may be empty.',steps:[{text:`London to New York on ${date}, business.`,expected:trip()}]},
 {id:'S2',name:'Second route → New York to San Francisco',description:'Different city groups exercise the same real search path.',steps:[{text:`New York to San Francisco on ${date}.`,expected:trip('New York','San Francisco')}]},
 {id:'M1',name:'Destination only → choose origin → real search',description:'No backend call until the missing origin is resolved. Choosing 1 means London; use the date and cabin defaults.',steps:[{text:'I want to go to New York.',expected:{status:'clarify',destination:CITY_CODES['New York'],origin:null,pending:'origin',menuCount:4,posts:0}},{text:'1',expected:trip('London','New York',clock,rollingEnd)}]},
 {id:'M2',name:'Origin only → choose destination → real search',description:'No backend call until a destination is chosen; the first suggestion is New York.',steps:[{text:'I want to fly from London.',expected:{status:'clarify',origin:CITY_CODES.London,destination:null,pending:'destination',menuCount:4,posts:0}},{text:'1',expected:trip('London','New York',clock,rollingEnd)}]},
 {id:'M3',name:'Both cities, no date → defaults, no extra question',description:'Search today through today+7, business, using the live staging inventory.',steps:[{text:'London to New York please.',expected:trip('London','New York',clock,rollingEnd)}]},
 {id:'F1',name:'Airport, budget and cabin follow-ups',description:'Preserve the date and USD 3000 budget when narrowing to Heathrow and then changing to economy. Filtering must not manufacture offers.',steps:[
  {text:`London to New York on ${date}, business, under USD 3000.`,expected:{...trip(),budget:3000}},
  {text:'Heathrow only please.',expected:{...trip(),origin:'LHR',budget:3000,posts:2}},
  {text:'Economy instead, keep everything else.',expected:{...trip(),origin:'LHR',cabin:'economy',budget:3000,posts:3}}]},
];
const runId=new Date().toISOString().replaceAll(':','-'),folder=`live-staging-${runId}`,base=fileURLToPath(new URL(`./eval-results/${folder}/`,import.meta.url));
mkdirSync(base,{recursive:true,mode:0o700});
const captures=[];
const report={runId,promptVersion:PROMPT_VERSION,label:'STAGING · six flows · real backend + reply checks',flightData:'staging',clock,effort,models:[model],repeats:1,adapter:'Authenticated staging searches',limitations:['One pass per flow; not a repeatability benchmark.','Empty inventory is a valid result, but cannot prove offer-field fidelity.','Staging prices are not guaranteed production availability.'],sourceHashes:Object.fromEntries(['search.mjs','model.mjs','staging.mjs','staging-suite.mjs','verify-flight-data.mjs','eval-cases.mjs'].map(f=>[f,createHash('sha256').update(readFileSync(new URL(f,import.meta.url))).digest('hex')])),results:[]};
const save=(name,data)=>{writeFileSync(base+name+'.tmp',JSON.stringify(data,null,2),{mode:0o600});renameSync(base+name+'.tmp',base+name);};
save('cases.json',cases);save('report.json',report);
console.log(`Dashboard: http://127.0.0.1:5180/?run=${folder}`);
for(const c of cases){
 const events=[],trace=(type,data)=>events.push({type,data});
 const adapter=makeStagingAdapter({trace,maxSearches:3});
 const conversation=new SearchConversation({adapter,today:()=>clock,trace});
 const agent=new Agent({conversation,model:new OpenRouterModel({apiKey:process.env.OPENROUTER_API_KEY,model,reasoningEffort:effort,maxCalls:3,trace}),trace});
 const steps=[];
 for(const s of c.steps){
  const started=performance.now(),result=await agent.respond(s.text),grade=gradeStep(s.expected,result,conversation,adapter);
  if(result.status==='results'){
   const snapshot=adapter.snapshots.at(-1),query=adapter.calls.filter(x=>x.method==='POST').at(-1)?.body;
   const grounding=verifyFlightData(result,snapshot,query);grade.checks.push(...grounding.checks);
   if(conversation.state.nonstopOnly)grade.checks.push({name:'Nonstop constraint',pass:result.shortlist.every(x=>x.direct)});
   grade.pass=grade.checks.every(x=>x.pass);
   captures.push({caseId:c.id,input:s.text,clock,capturedAt:new Date().toISOString(),query,snapshot});
  }
  steps.push({input:s.text,expected:s.expected,result,latencyMs:Math.round(performance.now()-started),grade});
  console.log(`${c.id} ${steps.length}: ${grade.pass?'PASS':'FAIL'} · ${result.status} · ${result.shortlist?.length??0} shown`);
 }
 report.results.push({caseId:c.id,name:c.name,model,repeat:1,pass:steps.every(s=>s.grade.pass),steps,events});
 save('captures.json',captures);save('report.json',report);
}
report.summary=[{model,passed:report.results.filter(r=>r.pass).length,total:cases.length,modelCalls:report.results.flatMap(r=>r.events).filter(e=>e.type==='model_usage').length}];
save('report.json',report);console.log(JSON.stringify(report.summary));process.exitCode=report.results.every(r=>r.pass)?0:1;
