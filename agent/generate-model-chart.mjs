import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const run=process.argv.find(value=>value.startsWith('--run='))?.slice(6);
if(!run||!/^compare-openrouter-[\w.-]+$/.test(run))throw new Error('Pass --run=compare-openrouter-...');
const report=JSON.parse(readFileSync(new URL(`./eval-results/${run}/report.json`,import.meta.url),'utf8'));
const rows=report.summary.filter(row=>Number.isFinite(row.medianMs)&&Number.isFinite(row.meanCost));
const W=960,H=560,L=92,R=40,T=82,B=112,maxX=Math.ceil(Math.max(...rows.map(row=>row.medianMs))/1000+.5);
const minLog=-4.2,maxLog=-2.2;
const x=value=>L+(value/1000)/maxX*(W-L-R);
const y=value=>T+(maxLog-Math.log10(value))/(maxLog-minLog)*(H-T-B);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const color=row=>row.model.includes('deepseek')?'#5d55c8':row.model.includes('glm')?'#963b85':row.model.includes('qwen')?'#168b8f':'#24805f';
const offsets={'or-terra-medium':[12,-12],'or-deepseek-flash-low':[12,24],'or-deepseek-flash-high':[12,-12],'or-qwen-35b-default':[12,24],'or-glm-full-high':[12,-14]};
const eligibleLabels=rows.filter(row=>row.eligible).map(row=>row.label).join(', ')||'No configuration';
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">Repeated OpenRouter validation: latency versus observed cost</title><desc id="chart-desc">Lower and farther left is better. ${escape(eligibleLabels)} passed the complete ${report.repeats}-repeat plan.</desc><style>text{font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;fill:#17243a}.title{font-size:25px;font-weight:700}.sub{font-size:14px;fill:#52627a}.axis{font-size:12px;fill:#617089}.grid{stroke:#dfe5ee;stroke-width:1}.eligible{stroke-width:3}.failed{fill:#fff;stroke-width:3}.label{font-size:12px;font-weight:650}.note{font-size:12px;fill:#52627a}</style><rect width="100%" height="100%" rx="16" fill="#f8fafc"/><text class="title" x="${L}" y="36">Repeated validation: speed versus observed cost</text><text class="sub" x="${L}" y="61">Lower left is better. Filled dots passed all ${report.repeats} repeats; hollow dots had at least one failed attempt.</text>`;
for(let tick=0;tick<=maxX;tick++){const px=x(tick*1000);svg+=`<line class="grid" x1="${px}" x2="${px}" y1="${T}" y2="${H-B}"/><text class="axis" x="${px}" y="${H-B+24}" text-anchor="middle">${tick}s</text>`;}
for(const [value,label] of [[.0001,'$0.0001'],[.001,'$0.001'],[.01,'$0.01']]){const py=y(value);svg+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${py}" y2="${py}"/><text class="axis" x="${L-12}" y="${py+4}" text-anchor="end">${label}</text>`;}
svg+=`<text class="axis" x="${(L+W-R)/2}" y="${H-62}" text-anchor="middle">Median elapsed time per scenario →</text><text class="axis" transform="translate(22 ${(T+H-B)/2}) rotate(-90)" text-anchor="middle">Observed cost per scenario, log scale →</text>`;
for(const row of rows){const px=x(row.medianMs),py=y(row.meanCost),[dx,dy]=offsets[row.id]??[12,-12],fill=row.eligible?color(row):'#ffffff';svg+=`<circle class="${row.eligible?'eligible':'failed'}" cx="${px}" cy="${py}" r="8" fill="${fill}" stroke="${color(row)}"><title>${escape(row.label)}: ${row.passed}/${row.completed} passed, ${(row.medianMs/1000).toFixed(2)} seconds, $${row.meanCost.toFixed(5)} per scenario</title></circle><text class="label" x="${px+dx}" y="${py+dy}">${escape(row.label)}</text>`;}
svg+=`<text class="note" x="${L}" y="${H-30}">${report.repeats} attempts per scenario. OpenRouter serving path. Missing-cost failures are omitted from this plot and remain in the table.</text></svg>`;
const output=fileURLToPath(new URL('../evaluation/openrouter-tradeoff.svg',import.meta.url));
writeFileSync(output,svg+'\n');
console.log(output);
