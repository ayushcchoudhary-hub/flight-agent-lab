import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const value=name=>process.argv.find(item=>item.startsWith(`--${name}=`))?.slice(name.length+3);
const openrouterId=value('openrouter');
const validationId=value('validation');
if(!openrouterId||!/^compare-openrouter-[\w.-]+$/.test(openrouterId))throw new Error('Pass --openrouter=compare-openrouter-...');
if(!validationId||!/^compare-openrouter-validation-[\w.-]+$/.test(validationId))throw new Error('Pass --validation=compare-openrouter-validation-...');
const codexId='compare-2026-09-19T10-06-49.201Z';
const load=id=>JSON.parse(readFileSync(new URL(`./eval-results/${id}/report.json`,import.meta.url),'utf8'));
const codex=load(codexId),openrouter=load(openrouterId),validation=load(validationId);
if(codex.status!=='complete'||openrouter.status!=='complete'||validation.status!=='complete')throw new Error('Every source run must be complete.');
const runId='compare-summary-'+new Date().toISOString().replaceAll(':','-');
const root=fileURLToPath(new URL(`./eval-results/${runId}/`,import.meta.url));
mkdirSync(root,{recursive:true,mode:0o700});
const pathConfigs=(source,path)=>source.configs.map(config=>({...config,servingPath:path,sourceRepeats:source.repeats}));
const pathSummary=(source,path)=>source.summary.map(summary=>({...summary,servingPath:path,sourceRepeats:source.repeats}));
const validatedIds=new Set(validation.configs.map(config=>config.id));
const screenOnly={...openrouter,configs:openrouter.configs.filter(config=>!validatedIds.has(config.id)),results:openrouter.results.filter(result=>!validatedIds.has(result.configId)),summary:openrouter.summary.filter(summary=>!validatedIds.has(summary.id))};
const report={
  runId,
  promptVersion:`${codex.promptVersion??'historical prompt snapshot'}, ${openrouter.promptVersion} and ${validation.promptVersion}`,
  experimentKind:'cross-path-reference',
  phase:'All-model reference',
  startedAt:new Date().toISOString(),
  completedAt:new Date().toISOString(),
  status:'complete',
  clock:validation.clock,
  configs:[...pathConfigs(codex,'Codex SDK'),...pathConfigs(screenOnly,'OpenRouter screen'),...pathConfigs(validation,'OpenRouter validation')],
  repeats:validation.repeats,
  cases:validation.cases,
  results:[...codex.results,...screenOnly.results,...validation.results],
  summary:[...pathSummary(codex,'Codex SDK'),...pathSummary(screenOnly,'OpenRouter screen'),...pathSummary(validation,'OpenRouter validation')],
  source:`${codexId}, ${openrouterId} and ${validationId}`,
  sourceRuns:[codexId,openrouterId,validationId],
  modelCallsAttempted:(codex.modelCallsAttempted??codex.results.length)+(openrouter.modelCallsAttempted??openrouter.results.length)+(validation.modelCallsAttempted??validation.results.length),
  rates:{source:'https://openrouter.ai/api/v1/models',checkedAt:openrouter.rates.checkedAt,tier:'Rates preserved from each source run',models:{...codex.rates.models,...openrouter.rates.models}},
  decisionTitle:'Current default: Terra medium. DeepSeek and GLM remain research controls.',
  decisionNote:'DeepSeek low passed 45 of 45 repeated development attempts and cost much less, but a later live request changed “3 October” to the default September window. Terra also felt faster and more accurate in manual trials. The current decision prioritizes live behavior and demo quality. Historical cross-path latency remains directional.',
  limitations:[
    'This is a derived view of three preserved runs. Opening it makes no model calls.',
    'The Codex SDK and OpenRouter use different serving paths, dates and prompt wrappers. Their latency and cost are useful context, not an apples-to-apples benchmark.',
    'Validated OpenRouter candidates have three attempts per scenario. Other screened configurations have one attempt.',
    'Only configurations that completed and passed all 15 cases are eligible in their source run.',
    'Six cases use pinned staging-derived data and nine use synthetic fixtures. No live flight searches occur during model comparison.',
  ],
};
writeFileSync(`${root}report.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({runId,sourceRuns:report.sourceRuns,configurations:report.configs.length,results:report.results.length},null,2));
