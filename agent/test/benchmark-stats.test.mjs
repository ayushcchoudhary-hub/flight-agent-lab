import test from 'node:test';
import assert from 'node:assert/strict';
import {RATES,estimateCost,quantile,summarize} from '../benchmark-stats.mjs';
test('cost uses separate input, cached and output rates without counting cache twice',()=>{
 assert.equal(estimateCost('gpt-6-astra',{input_tokens:1000,cached_input_tokens:500,output_tokens:100}),.0105);
 assert.equal(estimateCost('gpt-5.6-luna',{input_tokens:1000,cached_input_tokens:0,output_tokens:100}),.00032);
 for(const u of [null,{}, {input_tokens:1000,output_tokens:100}, {input_tokens:100,cached_input_tokens:101,output_tokens:1},{input_tokens:273000,cached_input_tokens:0,output_tokens:1}])assert.equal(estimateCost('gpt-6-astra',u),null);
});
const config={id:'x',model:'gpt-6-astra',effort:'low'};
const row=(pass,ms,fail=false)=>({configId:'x',caseId:'A',pass,steps:[{latencyMs:ms}],events:fail?[{type:'model_failure'}]:[{type:'model_usage',data:{usage:{input_tokens:1000,cached_input_tokens:500,output_tokens:100}}}]});
test('ranking excludes incomplete and failed runs, retains timeouts, and makes failed usage unknown',()=>{
 const report={configs:[config],cases:[{id:'A'}],repeats:2,rates:RATES,results:[row(true,1000)]};
 assert.equal(summarize(report)[0].eligible,false);
 report.results.push(row(true,3000));let summary=summarize(report)[0];assert.equal(summary.eligible,true);assert.equal(summary.medianMs,2000);assert.equal(summary.meanTokens,1100);assert.equal(summary.meanCost,.0105);
 report.results[1]=row(false,60000,true);summary=summarize(report)[0];assert.equal(summary.eligible,false);assert.equal(summary.meanCost,null);assert.equal(summary.meanTokens,null);assert.equal(summary.medianMs,30500);assert.equal(summary.perCase[0].passed,1);
});
test('quantiles preserve observed variation, including one-item and empty populations',()=>{assert.equal(quantile([], .5),null);assert.equal(quantile([42],.9),42);assert.equal(quantile([100,5,10],.5),10);});
