import {makeStagingAdapter} from './staging.mjs';
import {verifyFlightData} from './verify-flight-data.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { CodexModel } from './codex-model.mjs';
import { Agent, PROMPT_VERSION } from './model.mjs';
import { SearchConversation } from './search.mjs';
import { makeFixtureAdapter } from './fixtures.mjs';
import { EVAL_CASES, EVAL_CLOCK, gradeStep } from './edge-cases.mjs';

const option=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.split('=').slice(1).join('=')??fallback;
if(!process.argv.includes('--live')) throw new Error('Explicit --live required: this uses your Codex subscription allowance.');
const models=option('models','gpt-5.6-terra').split(',');
const repeats=Number(option('repeats','1'));
const effort=option('effort','medium');
const selected=option('cases','').split(',').filter(Boolean);
const cases=selected.length?EVAL_CASES.filter(c=>selected.includes(c.id)):EVAL_CASES;
if(!Number.isInteger(repeats)||repeats<1||repeats>5||models.length>3||!cases.length) throw new Error('Use 1–5 repeats, 1–3 models and valid case IDs.');
if(repeats!==1||models.length!==1||cases.reduce((n,c)=>n+c.steps.length,0)>25)throw new Error('Edge acceptance run capped at 25 turns, one model, one repetition.');
const runId=new Date().toISOString().replaceAll(':','-');
const base=fileURLToPath(new URL(`./eval-results/live-${runId}/`,import.meta.url));
mkdirSync(base,{recursive:true});
const sourceFiles=['search.mjs','model.mjs','codex-model.mjs','fixtures.mjs','eval-cases.mjs','edge-cases.mjs','edge-eval.mjs'];
const sourceHashes=Object.fromEntries(sourceFiles.map(name=>[name,createHash('sha256').update(readFileSync(new URL(name,import.meta.url))).digest('hex')]));
const report={runId,label:option('label','Terra medium: edge cases + one live staging search'),promptVersion:PROMPT_VERSION,sourceHashes,clock:EVAL_CLOCK,flightData:"mixed",effort,models,repeats,concurrency:1,adapter:'Codex SDK structured action; ChatGPT authentication; synthetic edge fixtures plus one public staging search',
  limitations:['One attempt per case: diagnostic acceptance checks, not a reliability estimate. Tone requires human review beyond lexical checks.','Same prompts repeated; not a held-out benchmark.','Latency includes SDK/CLI startup, network and model generation.','Cached input may affect latency across repeats.','Token counts include Codex overhead; they are not a dollar bill.','Model selects an action; application generates flight-result wording.'],results:[]};
writeFileSync(base+'cases.json',JSON.stringify(cases,null,2));
writeFileSync(base+'report.json',JSON.stringify(report,null,2));
let completed=0;
// Interleave models for each case/repetition; no concurrent requests bias timing.
evalLoop: for(let repeat=1;repeat<=repeats;repeat++) for(const item of cases) for(const model of models) {
  const events=[];const trace=(type,data)=>events.push({type,data});
  const adapter=item.live?makeStagingAdapter({authMode:'public',maxSearches:1,trace}):makeFixtureAdapter(item.scenario??'normal',trace);
  const conversation=new SearchConversation({adapter,today:()=>item.live?'2026-09-19':EVAL_CLOCK,trace});
  const agent=new Agent({conversation,model:new CodexModel({model,effort,maxCalls:item.steps.length,trace}),trace});
  const run={caseId:item.id,name:item.name,model,repeat,steps:[],events};
  for(const step of item.steps) {
    const start=performance.now();
    const eventStart=events.length;
    const result=await agent.respond(step.text);
    const grade=gradeStep(step.expected,result,conversation,adapter);
    const modelHealthy=!events.slice(eventStart).some(e=>e.type==='model_failure');
    grade.checks.push({name:'model completed or was not needed',pass:modelHealthy});
    grade.pass=grade.pass&&modelHealthy;
    if(item.live&&result.status==='results'){grade.checks.push(...verifyFlightData(result,adapter.snapshots.at(-1),adapter.calls.filter(c=>c.method==='POST').at(-1)?.body).checks);grade.pass=grade.checks.every(c=>c.pass);}
    run.steps.push({input:step.text,expected:step.expected,result,latencyMs:Math.round(performance.now()-start),grade});
  }
  if(item.live)writeFileSync(base+"staging-captures.json",JSON.stringify(adapter.snapshots,null,2),{mode:0o600});
  run.pass=run.steps.every(s=>s.grade.pass);
  report.results.push(run);
  writeFileSync(base+'report.json',JSON.stringify(report,null,2));
  console.log(`${++completed}/${cases.length*models.length*repeats} ${model} ${item.id} repeat ${repeat}: ${run.pass?'PASS':'FAIL'}${run.pass?'':' — '+run.steps.flatMap(s=>s.grade.checks.filter(c=>!c.pass).map(c=>c.name)).join(', ')}`);
  // Stop a model access/configuration failure before repeatedly spending allowance.
  if(events.some(e=>e.type==='model_failure'&&/not supported|not found|authentication|login|usage limit|rate limit|quota/i.test(e.data.message))) {
    console.log('Stopping after a model access/usage failure. Partial results retained.');
    process.exitCode=1;break evalLoop;
  }
}
const median=xs=>{const a=[...xs].sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
report.summary=models.map(model=>{
  const runs=report.results.filter(r=>r.model===model), usage=runs.flatMap(r=>r.events.filter(e=>e.type==='model_usage').map(e=>e.data));
  const sum=key=>usage.reduce((n,u)=>n+(u.usage?.[key]??0),0);
  return {model,passed:runs.filter(r=>r.pass).length,total:runs.length,modelCalls:usage.length,medianModelMs:median(usage.map(u=>u.latencyMs)),
    inputTokens:sum('input_tokens'),cachedInputTokens:sum('cached_input_tokens'),outputTokens:sum('output_tokens'),
    perCase:cases.map(c=>{const cr=runs.filter(r=>r.caseId===c.id);return{id:c.id,passed:cr.filter(r=>r.pass).length,total:cr.length,
      distinctActions:new Set(cr.map(r=>JSON.stringify(r.events.filter(e=>e.type==='tool_call').map(e=>e.data)))).size};})};
});
writeFileSync(base+'report.json',JSON.stringify(report,null,2));
const lines=['# Live model evaluation','',`Fixed date: ${EVAL_CLOCK} · effort: ${effort} · ${repeats} repetitions · sequential requests`,'',
  '**Real Codex models; fictional flights. No staging, purchases or OpenRouter calls.**','',
  '| Model | Passed scenarios | Model calls | Median model latency | Input tokens | Cached input (included) | Output tokens |',
  '|---|---:|---:|---:|---:|---:|---:|',...report.summary.map(s=>`| ${s.model} | ${s.passed}/${s.total} | ${s.modelCalls} | ${s.medianModelMs===null?'n/a':(s.medianModelMs/1000).toFixed(2)+' s'} | ${s.inputTokens} | ${s.cachedInputTokens} | ${s.outputTokens} |`),'',
  '## What we tested','',...cases.map(c=>`- **${c.id} ${c.name}:** ${c.steps.map(s=>s.text).join(' → ')}`),'',
  '## Repeatability','',...report.summary.flatMap(s=>[ `**${s.model}**`, '',...s.perCase.map(c=>`- ${c.id}: ${c.passed}/${c.total} passed; ${c.distinctActions} distinct raw action sequences.`),'']),
  'Action variation can be harmless: different city names may resolve to the same airports. Outcome checks determine success. Five passes do not prove zero failure risk.','',
  '## Limitations','',...report.limitations.map(x=>'- '+x),'',
  '## Actual conversations — first repetition and any failures',''];
for(const run of report.results.filter(r=>r.repeat===1||!r.pass)) {
  lines.push(`### ${run.model} · ${run.caseId} · repeat ${run.repeat} · ${run.pass?'PASS':'FAIL'}`,'');
  for(const step of run.steps) lines.push(`**You:** ${step.input}`,'','```text',step.result.text,'```','',`Expected: ${JSON.stringify(step.expected)}`,`Actual: ${JSON.stringify(step.grade.actual)}`,'',...step.grade.checks.filter(c=>!c.pass).map(c=>`**Failed:** ${c.name}`),'');
}
writeFileSync(base+'report.md',lines.join('\n'));
writeFileSync(fileURLToPath(new URL('./eval-results/latest-live.json',import.meta.url)),JSON.stringify({path:base,summary:report.summary},null,2));
console.log(`Report: ${base}report.md`);
console.log(JSON.stringify(report.summary,null,2));
if(report.results.some(r=>!r.pass))process.exitCode=1;
