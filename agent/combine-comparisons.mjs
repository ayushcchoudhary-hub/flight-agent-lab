import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const value=name=>process.argv.find(item=>item.startsWith(`--${name}=`))?.slice(name.length+3);
const openrouterId=value('openrouter');
if(!openrouterId||!/^compare-openrouter-[\w.-]+$/.test(openrouterId))throw new Error('Pass --openrouter=compare-openrouter-...');
const codexId='compare-2026-09-19T10-06-49.201Z';
const load=id=>JSON.parse(readFileSync(new URL(`./eval-results/${id}/report.json`,import.meta.url),'utf8'));
const codex=load(codexId),openrouter=load(openrouterId);
if(codex.status!=='complete'||openrouter.status!=='complete')throw new Error('Both source screens must be complete.');
const runId='compare-summary-'+new Date().toISOString().replaceAll(':','-');
const root=fileURLToPath(new URL(`./eval-results/${runId}/`,import.meta.url));
mkdirSync(root,{recursive:true,mode:0o700});
const pathConfigs=(source,path)=>source.configs.map(config=>({...config,servingPath:path}));
const pathSummary=(source,path)=>source.summary.map(summary=>({...summary,servingPath:path}));
const report={
  runId,
  promptVersion:`${codex.promptVersion??'historical prompt snapshot'} and ${openrouter.promptVersion}`,
  experimentKind:'cross-path-reference',
  phase:'All-model reference',
  startedAt:new Date().toISOString(),
  completedAt:new Date().toISOString(),
  status:'complete',
  clock:openrouter.clock,
  configs:[...pathConfigs(codex,'Codex SDK'),...pathConfigs(openrouter,'OpenRouter')],
  repeats:1,
  cases:openrouter.cases,
  results:[...codex.results,...openrouter.results],
  summary:[...pathSummary(codex,'Codex SDK'),...pathSummary(openrouter,'OpenRouter')],
  source:`${codexId} and ${openrouterId}`,
  sourceRuns:[codexId,openrouterId],
  modelCallsAttempted:(codex.modelCallsAttempted??codex.results.length)+(openrouter.modelCallsAttempted??openrouter.results.length),
  rates:{source:'https://openrouter.ai/api/v1/models',checkedAt:openrouter.rates.checkedAt,tier:'Rates preserved from each source run',models:{...codex.rates.models,...openrouter.rates.models}},
  decisionTitle:'Current choice: Terra medium. Next candidate: DeepSeek low.',
  decisionNote:'The historical OpenAI screen and the current OpenRouter screen appear together for context. DeepSeek low passed the 15-case screen with much lower observed cost and faster responses on its serving path. Repeat it before changing the deployed baseline. Cross-path latency is directional, not a controlled model-only comparison.',
  limitations:[
    'This is a derived view of two preserved runs. Opening it makes no model calls.',
    'The Codex SDK and OpenRouter use different serving paths, dates and prompt wrappers. Their latency and cost are useful context, not an apples-to-apples benchmark.',
    'OpenRouter candidates have one attempt per scenario. The historical screen also has one attempt per configuration and scenario.',
    'Only configurations that completed and passed all 15 cases are eligible in their source run.',
    'Six cases use pinned staging-derived data and nine use synthetic fixtures. No live flight searches occur during model comparison.',
  ],
};
writeFileSync(`${root}report.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({runId,sourceRuns:report.sourceRuns,configurations:report.configs.length,results:report.results.length},null,2));
