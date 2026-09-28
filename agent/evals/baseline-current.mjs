import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {PROMPT_VERSION} from '../src/model.mjs';
import { AGENT_ROOT, EVAL_RESULTS, agentPath } from '../paths.mjs';

if(!process.argv.includes('--live'))throw new Error('Pass --live: this baseline uses the configured OpenRouter account for about 30 model calls.');
const startedAt=new Date();
const root=AGENT_ROOT;
const before=new Set(readdirSync(EVAL_RESULTS));
const node=process.execPath;
async function run(name,args){
 await new Promise((resolve,reject)=>{
  const child=spawn(node,['--import','./register.mjs',...args],{cwd:root,stdio:'inherit',env:{...process.env}});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`${name} exited ${code}`)));
 });
}

await run('search and edge acceptance',['evals/edge-eval.mjs','--live','--models=openai/gpt-5.6-terra','--effort=medium','--repeats=1','--label=Frozen MVP baseline · Terra medium via OpenRouter']);
await run('policy checks',['evals/policy-smoke.mjs']);
await run('preference checks',['evals/preference-smoke.mjs']);

const created=readdirSync(EVAL_RESULTS).filter(x=>!before.has(x)&&x.startsWith('live-')).sort();
if(created.length!==1)throw new Error('Could not identify exactly one acceptance report.');
const acceptance=JSON.parse(readFileSync(agentPath('eval-results',created[0],'report.json')));
const policy=JSON.parse(readFileSync(agentPath('eval-results','policy-smoke','report.json')));
const preferences=JSON.parse(readFileSync(agentPath('eval-results','preference-smoke','report.json')));
const files=['FROZEN-SCOPE.md','evals/edge-cases.mjs','evals/edge-eval.mjs','src/model.mjs','src/policy.mjs','src/preferences.mjs','src/search.mjs'];
const hashes=Object.fromEntries(files.map(name=>[name,createHash('sha256').update(readFileSync(agentPath(name))).digest('hex')]));
const policyPass=policy.results.every(x=>x.result.status!=='error');
const preferencePass=preferences.results[0]?.result?.proposedPreferences?.homeAirport==='LHR'&&preferences.tripPreserved===true&&preferences.results[1]?.result?.status==='policy';
const report={
 label:'Frozen MVP baseline · Terra medium via OpenRouter',promptVersion:PROMPT_VERSION,startedAt:startedAt.toISOString(),completedAt:new Date().toISOString(),model:'openai/gpt-5.6-terra',effort:'medium',scope:'FROZEN-SCOPE.md',sourceHashes:hashes,
 acceptance:{run:created[0],passed:acceptance.results.filter(x=>x.pass).length,total:acceptance.results.length,modelCalls:acceptance.summary?.[0]?.modelCalls??null},
 policy:{passed:policyPass?policy.results.length:policy.results.filter(x=>x.result.status!=='error').length,total:policy.results.length,modelCalls:policy.calls},
 preferences:{passed:preferencePass?preferences.results.length:0,total:preferences.results.length,modelCalls:preferences.calls,tripPreserved:preferences.tripPreserved},
 limitations:['One attempt per scenario; not a reliability estimate.','Policy and preference checks are targeted smoke checks.','Seventeen flight cases use controlled fixtures; one calls public staging.','Latency and cost include the OpenRouter gateway and selected provider.'],
};
report.totalModelCalls=[report.acceptance.modelCalls,report.policy.modelCalls,report.preferences.modelCalls].reduce((a,b)=>a+(b??0),0);
report.pass=report.acceptance.passed===report.acceptance.total&&report.policy.passed===report.policy.total&&report.preferences.passed===report.preferences.total;
const id='baseline-'+startedAt.toISOString().replaceAll(':','-');mkdirSync(agentPath('eval-results',id),{recursive:true,mode:0o700});
writeFileSync(agentPath('eval-results',id,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
writeFileSync(agentPath('eval-results',id,'report.md'),`# ${report.label}\n\n- Result: **${report.pass?'PASS':'FAIL'}**\n- Search and edge scenarios: **${report.acceptance.passed}/${report.acceptance.total}**\n- Policy scenarios: **${report.policy.passed}/${report.policy.total}**\n- Preference scenarios: **${report.preferences.passed}/${report.preferences.total}**\n- Model calls: **${report.totalModelCalls}**\n- Acceptance detail: \`${report.acceptance.run}\`\n\nOne attempt per scenario is diagnostic evidence, not a production accuracy estimate.\n`);
console.log(JSON.stringify({id,...report},null,2));
if(!report.pass)process.exitCode=1;
