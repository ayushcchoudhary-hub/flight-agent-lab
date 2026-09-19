import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PROMPT_VERSION} from './model.mjs';

if(!process.argv.includes('--live'))throw new Error('Pass --live: this baseline uses the Codex subscription allowance for about 30 model calls.');
const startedAt=new Date();
const root=fileURLToPath(new URL('.',import.meta.url));
const before=new Set(readdirSync(new URL('./eval-results/',import.meta.url)));
const node=process.execPath;
async function run(name,args){
 await new Promise((resolve,reject)=>{
  const child=spawn(node,['--import','./register.mjs',...args],{cwd:root,stdio:'inherit',env:{...process.env}});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`${name} exited ${code}`)));
 });
}

await run('search and edge acceptance',['edge-eval.mjs','--live','--models=gpt-5.6-terra','--effort=medium','--repeats=1','--label=Frozen MVP baseline · Terra medium']);
await run('policy checks',['policy-smoke.mjs']);
await run('preference checks',['preference-smoke.mjs']);

const created=readdirSync(new URL('./eval-results/',import.meta.url)).filter(x=>!before.has(x)&&x.startsWith('live-')).sort();
if(created.length!==1)throw new Error('Could not identify exactly one acceptance report.');
const acceptance=JSON.parse(readFileSync(new URL(`./eval-results/${created[0]}/report.json`,import.meta.url)));
const policy=JSON.parse(readFileSync(new URL('./eval-results/policy-smoke/report.json',import.meta.url)));
const preferences=JSON.parse(readFileSync(new URL('./eval-results/preference-smoke/report.json',import.meta.url)));
const files=['FROZEN-SCOPE.md','edge-cases.mjs','edge-eval.mjs','model.mjs','policy.mjs','preferences.mjs','search.mjs'];
const hashes=Object.fromEntries(files.map(name=>[name,createHash('sha256').update(readFileSync(new URL(name,import.meta.url))).digest('hex')]));
const policyPass=policy.results.every(x=>x.result.status!=='error');
const preferencePass=preferences.results[0]?.result?.proposedPreferences?.homeAirport==='LHR'&&preferences.tripPreserved===true&&preferences.results[1]?.result?.status==='policy';
const report={
 label:'Frozen MVP baseline · Terra medium',promptVersion:PROMPT_VERSION,startedAt:startedAt.toISOString(),completedAt:new Date().toISOString(),model:'gpt-5.6-terra',effort:'medium',scope:'FROZEN-SCOPE.md',sourceHashes:hashes,
 acceptance:{run:created[0],passed:acceptance.results.filter(x=>x.pass).length,total:acceptance.results.length,modelCalls:acceptance.summary?.[0]?.modelCalls??null},
 policy:{passed:policyPass?policy.results.length:policy.results.filter(x=>x.result.status!=='error').length,total:policy.results.length,modelCalls:policy.calls},
 preferences:{passed:preferencePass?preferences.results.length:0,total:preferences.results.length,modelCalls:preferences.calls,tripPreserved:preferences.tripPreserved},
 limitations:['One attempt per scenario; not a reliability estimate.','Policy and preference checks are targeted smoke checks.','Seventeen flight cases use controlled fixtures; one calls public staging.','Token counts include Codex application overhead.'],
};
report.totalModelCalls=[report.acceptance.modelCalls,report.policy.modelCalls,report.preferences.modelCalls].reduce((a,b)=>a+(b??0),0);
report.pass=report.acceptance.passed===report.acceptance.total&&report.policy.passed===report.policy.total&&report.preferences.passed===report.preferences.total;
const id='baseline-'+startedAt.toISOString().replaceAll(':','-');mkdirSync(new URL(`./eval-results/${id}/`,import.meta.url),{recursive:true,mode:0o700});
writeFileSync(new URL(`./eval-results/${id}/report.json`,import.meta.url),JSON.stringify(report,null,2),{mode:0o600});
writeFileSync(new URL(`./eval-results/${id}/report.md`,import.meta.url),`# ${report.label}\n\n- Result: **${report.pass?'PASS':'FAIL'}**\n- Search and edge scenarios: **${report.acceptance.passed}/${report.acceptance.total}**\n- Policy scenarios: **${report.policy.passed}/${report.policy.total}**\n- Preference scenarios: **${report.preferences.passed}/${report.preferences.total}**\n- Model calls: **${report.totalModelCalls}**\n- Acceptance detail: \`${report.acceptance.run}\`\n\nOne attempt per scenario is diagnostic evidence, not a production accuracy estimate.\n`);
console.log(JSON.stringify({id,...report},null,2));
if(!report.pass)process.exitCode=1;
