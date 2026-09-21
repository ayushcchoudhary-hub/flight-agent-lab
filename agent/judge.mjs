export const JUDGE_RUBRIC_VERSION='communication-quality-v1.2.0';
export const JUDGE_SYSTEM_PROMPT=`You are an independent evaluator of a bounded flight-search assistant. Judge only the visible customer experience against the supplied requirement. Do not infer hidden facts. The evaluation harness has already removed its synthetic-inventory banner so it cannot distort the customer-copy score. Any URL listed in approvedSourceUrls is an approved public reference for this prototype. Do not penalize that exact URL as internal leakage, including a staging subdomain. Exact state and tool checks run separately, so score only the communication.

PRODUCT CONTRACT. These are facts, not items under review. Business cabin is the documented default when the traveler names no cabin. With no date, the application searches today through the next seven days. Flight inventory in this evaluation is synthetic test data. Times, carriers and seat counts can be missing, and routes need not exist in the real world. Do not grade the inventory, the defaults or real-world plausibility. Do not use outside knowledge about airlines or routes. Grade only what the reply controls: whether it states what was searched, discloses what is missing, stays honest about limits and gives a useful next step.

Score each criterion from 1 to 5. A pass requires every score to be at least 4 and no major or critical issue. For a fully answered informational question, nextStep measures whether the answer itself resolves the request. Do not require an unnecessary invitation or call to action. Be strict about invented capabilities, lost context, vague limitations, unhelpful handoffs, implementation leakage, excessive wording or hostility. Return a short audit, not chain-of-thought.`;
const schema={type:'object',additionalProperties:false,required:['verdict','scores','rationale','strengths','issues','recommendedAction'],properties:{
 verdict:{type:'string',enum:['pass','needs_review','fail']},
 scores:{type:'object',additionalProperties:false,required:['clarity','concision','tone','nextStep','limitationHonesty','noInternalLeakage'],properties:Object.fromEntries(['clarity','concision','tone','nextStep','limitationHonesty','noInternalLeakage'].map(k=>[k,{type:'integer',minimum:1,maximum:5}]))},
 rationale:{type:'string',maxLength:500},strengths:{type:'array',maxItems:3,items:{type:'string',maxLength:180}},
 issues:{type:'array',maxItems:4,items:{type:'object',additionalProperties:false,required:['severity','criterion','evidence','recommendation'],properties:{severity:{type:'string',enum:['minor','major','critical']},criterion:{type:'string'},evidence:{type:'string',maxLength:220},recommendation:{type:'string',maxLength:240}}}},
 recommendedAction:{type:'string',enum:['none','prompt','deterministic_guardrail','scope_decision','human_review']}
}};
export function parseJudgeOutput(content){
 const text=Array.isArray(content)?content.map(part=>part?.text??'').join(''):String(content??'');
 return JSON.parse(text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
}
export class OpenRouterJudge{
 constructor({apiKey,model='anthropic/claude-sonnet-4.6',effort='low',trace=()=>{},beforeRequest=()=>{}}={}){if(!apiKey)throw Error('Set OPENROUTER_API_KEY.');this.apiKey=apiKey;this.model=model;this.effort=effort;this.trace=trace;this.beforeRequest=beforeRequest;this.calls=0;}
 // The judge never sees the exact-check result. That keeps the communication
 // score independent. The runner combines both gates in code.
 async evaluate({caseId,category,requirement,steps,notes=[]}){
  const productionEquivalent=text=>text.replace(/^SYNTHETIC FLIGHT DATA\. These are example results\.\n\n/,'');
  const approvedSourceUrls=[...new Set(steps.flatMap(s=>(s.result.sources??[]).map(source=>source.url)))];
  const input={caseId,category,requirement,offScreenEvents:notes,approvedPolicyEvidence:approvedSourceUrls.length>0,approvedSourceUrls,conversation:steps.map(s=>({traveler:s.input,assistant:productionEquivalent(s.result.text),status:s.result.status}))};
  const messages=[{role:'system',content:JUDGE_SYSTEM_PROMPT},{role:'user',content:JSON.stringify(input)}];
  const body={model:this.model,messages,max_tokens:this.effort==='low'?900:2500,reasoning:{effort:this.effort},response_format:{type:'json_schema',json_schema:{name:'flight_agent_judge',strict:true,schema}},provider:{require_parameters:true,allow_fallbacks:false,data_collection:'deny'},usage:{include:true}};
  await this.beforeRequest({model:this.model,inputCharacters:JSON.stringify(messages).length,maxOutputTokens:900});this.calls++;
  const started=Date.now(),response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(45000),headers:{Authorization:`Bearer ${this.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw Error(`Judge returned HTTP ${response.status}.`);const data=await response.json();if(data.error)throw Error('Judge reported an error.');
  // Reasoning and the answer share max_tokens. Above low effort the reasoning
  // can consume it and truncate the JSON, so the budget is larger there and
  // the finish reason is kept for diagnosis.
  let result;try{result=parseJudgeOutput(data.choices?.[0]?.message?.content);}catch{throw Error(`Judge returned unreadable structured output (finish_reason=${data.choices?.[0]?.finish_reason??'unknown'}, completion_tokens=${data.usage?.completion_tokens??'?'}).`);}
  this.trace('judge_usage',{model:data.model??this.model,provider:data.provider??null,latencyMs:Date.now()-started,usage:data.usage??null,cost:Number.isFinite(data.usage?.cost)?data.usage.cost:null});
  return result;
 }
}
export function judgePass(result){return result.verdict==='pass'&&Object.values(result.scores).every(score=>score>=4)&&!result.issues.some(issue=>['major','critical'].includes(issue.severity));}
// A malformed structured response is a provider flake, not a verdict, and one
// of them aborted two paid runs at roughly sixty percent. Retry that specific
// failure once. Every other error still stops the run, and a verdict is never
// re-rolled for being unwelcome.
const UNREADABLE=/unreadable structured output/i;
async function evaluateTolerantly(evaluate){
 try{return await evaluate();}
 catch(error){if(!UNREADABLE.test(error?.message??''))throw error;return await evaluate();}
}
export async function evaluateJudgeConsensus({deterministicPass,evaluate,isPass=judgePass}){
 const attempts=[await evaluateTolerantly(evaluate)];
 if(deterministicPass&&!isPass(attempts[0]))attempts.push(await evaluateTolerantly(evaluate),await evaluateTolerantly(evaluate));
 const passingVotes=attempts.filter(isPass).length,communicationPass=passingVotes>attempts.length/2;
 const representative=attempts.find(result=>isPass(result)===communicationPass)??attempts[0];
 return {judge:representative,judgeAttempts:attempts,judgeConsensus:{passingVotes,totalVotes:attempts.length,verdicts:attempts.map(result=>result.verdict)},communicationPass};
}
