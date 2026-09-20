import {Agent,OpenRouterModel} from './model.mjs';

import {mkdirSync,writeFileSync} from 'node:fs';
const events=[];const trace=(type,data)=>events.push({type,data});
const model=new OpenRouterModel({apiKey:process.env.OPENROUTER_API_KEY,model:'openai/gpt-5.6-terra',reasoningEffort:'medium',maxCalls:10,trace});
const trip={origin:'London',destination:'New York',cabin:'business'};
const conversation={adapter:{mode:'replay'},today:()=> '2026-09-19',publicState:()=>trip,find:async()=>{throw Error('Unexpected flight search in policy test')}};
const agent=new Agent({conversation,model,trace});
const results=[];
for(const question of ['Do you store my card details?','If I close my account, is all my analytics information automatically deleted?','Can I get a refund on any ticket?','Write me a poem about dinosaurs.']){
 const result=await agent.respond(question);results.push({question,result});console.log(JSON.stringify({question,result}));
}
mkdirSync('eval-results/policy-smoke',{recursive:true});
writeFileSync('eval-results/policy-smoke/report.json',JSON.stringify({model:'Terra medium',date:new Date().toISOString(),calls:model.calls,results,events,trip},null,2));
