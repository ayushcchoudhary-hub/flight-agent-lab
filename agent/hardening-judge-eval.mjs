import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Agent,OpenRouterModel,PROMPT_VERSION} from './model.mjs';
import {SearchConversation} from './search.mjs';
import {makeFixtureAdapter} from './fixtures.mjs';
import {gradeStep} from './edge-cases.mjs';
import {HARDENING_CASES,HARDENING_CLOCK} from './hardening-cases.mjs';
import {JUDGE_RUBRIC_VERSION,OpenRouterJudge,judgePass} from './judge.mjs';

const value=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
if(!process.argv.includes('--live'))throw Error('Pass --live to authorize bounded OpenRouter model calls.');
const candidateModel=value('candidate','openai/gpt-5.6-terra'),candidateEffort=value('candidate-effort','medium');
const judgeModel=value('judge','anthropic/claude-sonnet-4.6'),judgeEffort=value('judge-effort','low');
const maxCost=Number(value('max-cost','3')),maxCalls=Number(value('max-calls','110'));
const selected=value('cases','').split(',').filter(Boolean),cases=selected.length?HARDENING_CASES.filter(c=>selected.includes(c.id)):HARDENING_CASES;
const runLabel=value('label',selected.length?'Terra hardening · targeted correction':'Terra hardening · frozen baseline');
if(!process.env.OPENROUTER_API_KEY)throw Error('Set OPENROUTER_API_KEY. No model calls were made.');
if(!Number.isFinite(maxCost)||maxCost<=0||maxCost>8||!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>150||!cases.length)throw Error('Use a cost cap up to $8, a call cap up to 150 and valid cases.');
const catalog=await (await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(15000)})).json();
const byId=new Map(catalog.data.map(model=>[model.id,model]));
for(const id of [candidateModel,judgeModel])if(!byId.has(id))throw Error(`OpenRouter does not list ${id}. No model calls were made.`);
const maxPrice=(model,field)=>Math.max(Number(model.pricing?.[field]??0),...(model.pricing?.overrides??[]).map(x=>Number(x[field]??0)));
const bound=(model,inputCharacters,maxOutputTokens)=>inputCharacters*maxPrice(model,'prompt')+maxOutputTokens*maxPrice(model,'completion');
const budget={actualCostUsd:0,conservativeReservedUsd:0,calls:0};
const beforeRequest=({model,inputCharacters,maxOutputTokens})=>{const estimate=bound(byId.get(model),inputCharacters,maxOutputTokens);if(budget.calls>=maxCalls)throw Object.assign(Error('Evaluation call cap reached.'),{code:'EVAL_BUDGET'});if(budget.conservativeReservedUsd+estimate>maxCost)throw Object.assign(Error('Evaluation cost cap reached before the next request.'),{code:'EVAL_BUDGET'});budget.calls++;budget.conservativeReservedUsd+=estimate;};
const account=(event)=>{if(Number.isFinite(event.data?.cost))budget.actualCostUsd+=event.data.cost;};
const runId='live-hardening-judge-'+new Date().toISOString().replaceAll(':','-');
const rawRoot=fileURLToPath(new URL(`./eval-results/${runId}/`,import.meta.url));
const publicRoot=fileURLToPath(new URL(`./published-eval-results/${runId}/`,import.meta.url));
mkdirSync(rawRoot,{recursive:true,mode:0o700});mkdirSync(publicRoot,{recursive:true});
const sourceFiles=['model.mjs','search.mjs','policy.mjs','customer-copy.mjs','hardening-cases.mjs','hardening-judge-eval.mjs','judge.mjs'];
const sourceHashes=Object.fromEntries(sourceFiles.map(name=>[name,createHash('sha256').update(readFileSync(new URL(name,import.meta.url))).digest('hex')]));
const report={runId,evaluationKind:'llm-judge-hardening',label:runLabel,promptVersion:PROMPT_VERSION,judge:{model:judgeModel,effort:judgeEffort,rubricVersion:JUDGE_RUBRIC_VERSION,criteria:['clarity','concision','tone','nextStep','limitationHonesty','noInternalLeakage']},clock:HARDENING_CLOCK,flightData:'synthetic',effort:candidateEffort,models:[candidateModel],repeats:1,cases,status:'running',maxCostUsd:maxCost,maxCalls,sourceHashes,results:[],limitations:['Held-out language written before the frozen baseline. A targeted correction run reuses only previously failing or disputed cases.','One attempt per case does not establish reliability.','The judge reviews communication quality and can be wrong. Deterministic checks remain authoritative for facts and actions.','The judge receives blinded candidate output and no private reasoning.','The synthetic-inventory banner is retained in the report but removed from judge input because production does not show it.','Synthetic inventory is used. No booking, payment or live flight search occurs.']};
const save=()=>writeFileSync(rawRoot+'report.json',JSON.stringify(report,null,2),{mode:0o600});save();
for(const item of cases){
 const events=[],trace=(type,data)=>{events.push({type,data});if(type==='model_usage'||type==='judge_usage')account({type,data});};
 const adapter=makeFixtureAdapter(item.scenario??'normal',trace),conversation=new SearchConversation({adapter,today:()=>HARDENING_CLOCK,trace});
 const candidate=new OpenRouterModel({apiKey:process.env.OPENROUTER_API_KEY,model:candidateModel,reasoningEffort:candidateEffort,maxCalls:item.steps.length*3,trace,beforeRequest,provider:{data_collection:'deny'}});
 const agent=new Agent({conversation,model:candidate,trace}),steps=[];
 for(const step of item.steps){const started=performance.now();const result=await agent.respond(step.text);const grade=gradeStep(step.expected,result,conversation,adapter);steps.push({input:step.text,expected:step.expected,result,latencyMs:Math.round(performance.now()-started),grade});}
 const deterministicPass=steps.every(step=>step.grade.pass);
 let judged;
 try{const judge=new OpenRouterJudge({apiKey:process.env.OPENROUTER_API_KEY,model:judgeModel,effort:judgeEffort,trace,beforeRequest});judged=await judge.evaluate({caseId:item.id,category:item.category,requirement:item.requirement,steps,deterministicPass});}
 catch(error){judged={verdict:'needs_review',scores:{clarity:1,concision:1,tone:1,nextStep:1,limitationHonesty:1,noInternalLeakage:1},rationale:`Judge unavailable: ${error.message}`,strengths:[],issues:[{severity:'major',criterion:'judge availability',evidence:'No judge result was recorded.',recommendation:'Review this conversation manually.'}],recommendedAction:'human_review'};}
 const communicationPass=judgePass(judged),pass=deterministicPass&&communicationPass;
 report.results.push({caseId:item.id,name:item.name,category:item.category,requirement:item.requirement,model:candidateModel,repeat:1,pass,deterministicPass,communicationPass,steps,judge:judged,events});
 save();console.log(`${report.results.length}/${cases.length} ${item.id} ${pass?'PASS':'REVIEW'} · deterministic ${deterministicPass?'pass':'fail'} · judge ${judged.verdict}`);
}
report.status='complete';report.completedAt=new Date().toISOString();report.modelCallsAttempted=budget.calls;report.actualCostUsd=budget.actualCostUsd;report.conservativeReservedUsd=budget.conservativeReservedUsd;
report.summary=[{model:candidateModel,passed:report.results.filter(r=>r.pass).length,total:report.results.length,deterministicPassed:report.results.filter(r=>r.deterministicPass).length,judgePassed:report.results.filter(r=>r.communicationPass).length,modelCalls:report.results.flatMap(r=>r.events).filter(e=>e.type==='model_usage').length,judgeCalls:report.results.flatMap(r=>r.events).filter(e=>e.type==='judge_usage').length,cost:budget.actualCostUsd}];
save();writeFileSync(rawRoot+'cases.json',JSON.stringify(cases,null,2),{mode:0o600});
const cleanEvent=event=>event.type==='model_usage'||event.type==='judge_usage'?{type:event.type,data:{model:event.data.model,provider:event.data.provider,latencyMs:event.data.latencyMs,usage:event.data.usage,cost:event.data.cost}}:event;
const publicReport={...report,sourceHashes:undefined,results:report.results.map(row=>({...row,events:row.events.filter(e=>['tool_call','tool_argument_repair','flight_api','model_usage','judge_usage','search_result','policy_retrieval','policy_answer','policy_failure'].includes(e.type)).map(cleanEvent)}))};
writeFileSync(publicRoot+'report.json',JSON.stringify(publicReport,null,2));writeFileSync(publicRoot+'cases.json',JSON.stringify(cases,null,2));
console.log(JSON.stringify({runId,passed:report.summary[0].passed,total:cases.length,deterministicPassed:report.summary[0].deterministicPassed,judgePassed:report.summary[0].judgePassed,calls:budget.calls,actualCostUsd:budget.actualCostUsd,conservativeReservedUsd:budget.conservativeReservedUsd},null,2));
