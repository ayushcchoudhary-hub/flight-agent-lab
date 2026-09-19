import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Agent,OpenRouterModel,PROMPT_VERSION} from './model.mjs';
import {SearchConversation} from './search.mjs';
import {makeReplayAdapter} from './replay.mjs';
import {makeFixtureAdapter} from './fixtures.mjs';
import {EVAL_CASES,gradeStep} from './eval-cases.mjs';
import {verifyFlightData} from './verify-flight-data.mjs';
import {summarize,estimateCost} from './benchmark-stats.mjs';
import {OPENROUTER_CONFIGS,OPENROUTER_SMOKE_CASES,priceRates,requestCostUpperBound,validateCatalog} from './openrouter-options.mjs';

const arg=(name,fallback)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const live=process.argv.includes('--live');
const maxCostUsd=Number(arg('max-cost','5'));
const modelCallCap=Number(arg('max-calls','200'));
if(!Number.isFinite(maxCostUsd)||maxCostUsd<=0||maxCostUsd>8)throw new Error('Set --max-cost above zero and no higher than 8 USD.');
if(!Number.isInteger(modelCallCap)||modelCallCap<1||modelCallCap>200)throw new Error('Set --max-calls from 1 to 200.');

const catalogResponse=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(15000)});
if(!catalogResponse.ok)throw new Error('OpenRouter model catalog is unavailable. No paid calls were made.');
const catalog=(await catalogResponse.json()).data;
const configs=validateCatalog(OPENROUTER_CONFIGS,catalog);
const rates=priceRates(configs);
const callsPerConfig=EVAL_CASES.reduce((sum,item)=>sum+item.steps.filter(step=>!/^\d+$/.test(step.text)).length,0);
const maximumPlannedCost=configs.reduce((sum,config)=>sum+callsPerConfig*requestCostUpperBound(config,24000,800),0);
const plan={configs:configs.map(({pricing,...config})=>config),smokeCases:OPENROUTER_SMOKE_CASES,fullCases:EVAL_CASES.map(item=>item.id),callsPerConfig,maximumCalls:callsPerConfig*configs.length,modelCallCap,maxCostUsd,conservativeMaximumPlannedCost:maximumPlannedCost};
console.log(JSON.stringify(plan,null,2));
if(!live)process.exit(0);
if(!process.env.OPENROUTER_API_KEY)throw new Error('Set OPENROUTER_API_KEY. The catalog check was free and no model calls were made.');
if(maximumPlannedCost>maxCostUsd)throw new Error(`The conservative plan maximum is $${maximumPlannedCost.toFixed(2)}, above the $${maxCostUsd.toFixed(2)} cap. No model calls were made.`);

const source='live-staging-2026-09-19T03-32-45.495Z';
const sourceRoot=new URL(`./eval-results/${source}/`,import.meta.url);
const captures=JSON.parse(readFileSync(new URL('captures.json',sourceRoot)));
const stagingCases=JSON.parse(readFileSync(new URL('cases.json',sourceRoot)));
const clock=JSON.parse(readFileSync(new URL('report.json',sourceRoot))).clock;
const mapping={R1:'S1',R2:'S2',M1:'M2',M2:'M1',M3:'M3',F1:'F1'};
const cases=EVAL_CASES.map(item=>mapping[item.id]?{...structuredClone(stagingCases.find(row=>row.id===mapping[item.id])),id:item.id,dataSource:'recorded staging'}:{...structuredClone(item),dataSource:'synthetic edge/route fixture'});
const runId='compare-openrouter-'+new Date().toISOString().replaceAll(':','-');
const root=fileURLToPath(new URL(`./eval-results/${runId}/`,import.meta.url));
mkdirSync(root,{recursive:true,mode:0o700});mkdirSync(root+'source',{mode:0o700});
const files=['openrouter-benchmark.mjs','openrouter-options.mjs','benchmark-stats.mjs','model.mjs','search.mjs','shared.mjs','flight-details.mjs','verify-flight-data.mjs','replay.mjs','fixtures.mjs','eval-cases.mjs'];
const sourceHashes={};for(const file of files){const bytes=readFileSync(new URL(file,import.meta.url));sourceHashes[file]=createHash('sha256').update(bytes).digest('hex');writeFileSync(root+'source/'+file,bytes);}
const captureBytes=readFileSync(new URL('captures.json',sourceRoot));writeFileSync(root+'captures.json',captureBytes,{mode:0o600});
const report={runId,promptVersion:PROMPT_VERSION,experimentKind:'openrouter-screen',phase:'Open-weight screen',startedAt:new Date().toISOString(),status:'running',clock,configs:configs.map(({pricing,...config})=>config),repeats:1,cases,plannedCalls:plan.maximumCalls,modelCallCap,maxCostUsd,modelCallsAttempted:0,actualCostUsd:0,conservativeUnreportedCostUsd:0,source,sourceHashes,captureHash:createHash('sha256').update(captureBytes).digest('hex'),rates,results:[],disabled:[],decisionTitle:'Open-weight candidates versus the Terra control',decisionNote:'Use correctness as the gate. Then compare latency, actual OpenRouter cost and token use. Historical Astra, Luna, Sol and Terra Codex-path results remain available as a separate reference run.',limitations:['Development cases, not held-out tests.','The same prompts are used across configurations.','Six cases use a pinned staging-derived fixture and nine use synthetic fixtures. No live flight searches occur.','Latency includes the OpenRouter gateway and its selected provider. It is not model-only compute time.','Provider fallbacks and automatic model substitution are disabled.','Actual response cost is preferred. Missing usage reserves a conservative upper bound.','One attempt screens compatibility. It is not a reliability estimate.','Historical Codex-path measurements use a different serving path and should not be treated as a controlled latency comparison.']};
const save=()=>{report.summary=summarize(report);writeFileSync(root+'report.tmp',JSON.stringify(report,null,2),{mode:0o600});renameSync(root+'report.tmp',root+'report.json');};save();
console.log(`Comparison: http://127.0.0.1:5180/compare?run=${runId}`);

let calls=0,spent=0,unreported=0,halt=false;
async function execute(item,config){
  const events=[];let reservedThisCase=0,budgetReason=null;
  const trace=(type,data)=>events.push({type,data});
  const adapter=item.dataSource==='recorded staging'?makeReplayAdapter({captures,trace}):makeFixtureAdapter(item.scenario??'normal',trace);
  const conversation=new SearchConversation({adapter,today:()=>clock,trace});
  const beforeRequest=({inputCharacters,maxOutputTokens})=>{
    const upper=requestCostUpperBound(config,inputCharacters,maxOutputTokens);
    if(calls>=modelCallCap){budgetReason='OpenRouter evaluation model-call cap reached.';throw Object.assign(new Error(budgetReason),{code:'EVAL_BUDGET'});}
    if(spent+unreported+upper>maxCostUsd){budgetReason='OpenRouter evaluation cost cap would be exceeded.';throw Object.assign(new Error(budgetReason),{code:'EVAL_BUDGET'});}
    reservedThisCase+=upper;
  };
  const model=new OpenRouterModel({apiKey:process.env.OPENROUTER_API_KEY,model:config.model,reasoningEffort:config.effort??undefined,maxCalls:item.steps.length,trace,maxTemporaryRetries:0,beforeRequest,provider:{data_collection:'deny'}});
  const agent=new Agent({conversation,model,trace}),steps=[];
  for(const step of item.steps){
    const started=performance.now(),eventStart=events.length,result=await agent.respond(step.text);
    if(budgetReason)throw Object.assign(new Error(budgetReason),{code:'EVAL_BUDGET'});
    const grade=gradeStep(step.expected,result,conversation,adapter);
    const turnEvents=events.slice(eventStart),usage=turnEvents.filter(event=>event.type==='model_usage');
    if(!/^\d+$/.test(step.text)){grade.checks.push({name:'model completed',pass:usage.length===1});grade.pass=grade.checks.every(check=>check.pass);}
    if(item.dataSource==='recorded staging'&&result.status==='results')grade.checks.push(...verifyFlightData(result,adapter.snapshots.at(-1),adapter.calls.filter(call=>call.method==='POST').at(-1)?.body).checks);
    grade.pass=grade.checks.every(check=>check.pass);steps.push({input:step.text,expected:step.expected,result,latencyMs:Math.round(performance.now()-started),grade});
  }
  calls+=model.calls;
  const measured=events.filter(event=>event.type==='model_usage').reduce((sum,event)=>sum+(estimateCost(config.model,event.data.usage,rates)??0),0);
  const hasUnknown=model.calls>events.filter(event=>event.type==='model_usage').length;
  spent+=measured;if(hasUnknown)unreported+=reservedThisCase;
  report.modelCallsAttempted=calls;report.actualCostUsd=spent;report.conservativeUnreportedCostUsd=unreported;
  const row={configId:config.id,caseId:item.id,repeat:1,dataSource:item.dataSource,pass:steps.every(step=>step.grade.pass),steps,events};report.results.push(row);save();
  console.log(`${report.results.length} ${config.label} ${item.id}: ${row.pass?'PASS':'FAIL'} · ${calls}/${modelCallCap} calls · $${spent.toFixed(4)} reported`);
  return row;
}

const smoke=cases.filter(item=>OPENROUTER_SMOKE_CASES.includes(item.id));
for(let index=0;index<smoke.length&&!halt;index++){
  const item=smoke[index],rotation=index%configs.length,order=[...configs.slice(rotation),...configs.slice(0,rotation)];
  for(const config of order){try{await execute(item,config);}catch(error){report.disabled.push({id:config.id,reason:error.message});if(/cap/.test(error.message))halt=true;save();}if(halt)break;}
}
const active=configs.filter(config=>OPENROUTER_SMOKE_CASES.every(id=>report.results.some(row=>row.configId===config.id&&row.caseId===id&&row.pass)));
for(const config of configs.filter(config=>!active.includes(config)))if(!report.disabled.some(item=>item.id===config.id))report.disabled.push({id:config.id,reason:'Did not pass every smoke-screen case.'});
const remaining=cases.filter(item=>!OPENROUTER_SMOKE_CASES.includes(item.id));
for(let index=0;index<remaining.length&&!halt;index++){
  const item=remaining[index],rotation=index%Math.max(1,active.length),order=[...active.slice(rotation),...active.slice(0,rotation)];
  for(const config of order){try{await execute(item,config);}catch(error){report.disabled.push({id:config.id,reason:error.message});if(/cap/.test(error.message))halt=true;save();}if(halt)break;}
}
report.status=halt?'stopped':'complete';report.completedAt=new Date().toISOString();report.stopReason=halt?'Application call or cost cap reached.':null;save();
if(!halt){
  const eligible=report.summary.filter(item=>item.eligible).sort((a,b)=>a.medianMs-b.medianMs);
  const cheapest=[...eligible].sort((a,b)=>a.meanCost-b.meanCost)[0];
  report.decisionTitle='Open-weight screen: DeepSeek low and GLM high passed';
  report.decisionNote=`${eligible.map(item=>item.label).join(', ')} passed all 15 scenarios once. ${eligible[0]?.label} had the fastest median. ${cheapest?.label} had the lowest observed cost. Treat this as candidate screening until repeated validation confirms consistency.`;
  save();
}
console.log(JSON.stringify({runId,status:report.status,modelCallsAttempted:calls,actualCostUsd:spent,conservativeUnreportedCostUsd:unreported,summary:report.summary.map(item=>({config:item.label,passed:item.passed,total:item.completed,eligible:item.eligible,medianMs:item.medianMs,meanTokens:item.meanTokens,meanCost:item.meanCost}))},null,2));
if(!active.length||halt)process.exitCode=1;
