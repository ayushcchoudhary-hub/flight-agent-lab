export const RATES={source:'https://developers.openai.com/api/docs/pricing',checkedAt:'2026-09-19',tier:'Standard API, short context',models:{'gpt-6-astra':{input:10,cached:1,output:50},'gpt-5.6-sol':{input:4,cached:.4,output:20},'gpt-5.6-terra':{input:2,cached:.2,output:12},'gpt-5.6-luna':{input:.2,cached:.02,output:1.2}}};
export function estimateCost(model,u,rates=RATES){
 const rate=rates.models[model];if(!rate||!u||![u.input_tokens,u.output_tokens,u.cached_input_tokens].every(Number.isFinite)||u.input_tokens<0||u.output_tokens<0||u.cached_input_tokens<0||u.cached_input_tokens>u.input_tokens||u.input_tokens>272000)return null;
 // Cache-write token counts are not exposed here; treat uncached tokens as normal input.
 return ((u.input_tokens-u.cached_input_tokens)*rate.input+u.cached_input_tokens*rate.cached+u.output_tokens*rate.output)/1e6;
}
export function quantile(xs,p){if(!xs.length)return null;const a=[...xs].sort((a,b)=>a-b),i=(a.length-1)*p,lo=Math.floor(i);return a[lo]+(a[Math.ceil(i)]-a[lo])*(i-lo);}
export function summarize(report){return report.configs.map(c=>{
 const rows=report.results.filter(r=>r.configId===c.id),measurements=rows.map(r=>{
  const used=r.events.filter(e=>e.type==='model_usage'),failed=r.events.some(e=>e.type==='model_failure');
  const complete=!failed&&used.every(e=>estimateCost(c.model,e.data.usage,report.rates)!==null);
  return {latency:r.steps.reduce((n,s)=>n+s.latencyMs,0),tokens:complete?used.reduce((n,e)=>n+e.data.usage.input_tokens+e.data.usage.output_tokens,0):null,cost:complete?used.reduce((n,e)=>n+estimateCost(c.model,e.data.usage,report.rates),0):null};
 });
 const full=rows.length===report.cases.length*report.repeats,passed=rows.filter(r=>r.pass).length;
 const known=measurements.every(m=>m.cost!==null);
 const perCase=report.cases.map(k=>{const rr=rows.filter(r=>r.caseId===k.id);return {id:k.id,passed:rr.filter(r=>r.pass).length,total:rr.length};});
 return {...c,completed:rows.length,planned:report.cases.length*report.repeats,passed,eligible:full&&passed===rows.length,perCase,medianMs:quantile(measurements.map(m=>m.latency),.5),p10Ms:quantile(measurements.map(m=>m.latency),.1),p90Ms:quantile(measurements.map(m=>m.latency),.9),meanTokens:known&&rows.length?measurements.reduce((n,m)=>n+m.tokens,0)/rows.length:null,meanCost:known&&rows.length?measurements.reduce((n,m)=>n+m.cost,0)/rows.length:null,usageComplete:known,failed:rows.length-passed};
 });}
