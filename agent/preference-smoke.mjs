import {Agent,OpenRouterModel} from './model.mjs';import {SearchConversation} from './search.mjs';import {writeFileSync,mkdirSync} from 'node:fs';
const events=[];const trace=(type,data)=>events.push({type,data});
const model=new OpenRouterModel({apiKey:process.env.OPENROUTER_API_KEY,model:'openai/gpt-5.6-terra',reasoningEffort:'medium',maxCalls:4,trace});
const conversation=new SearchConversation({adapter:{mode:'replay'},today:()=> '2026-09-19'});
await conversation.find({origin:'London'});
const before=JSON.stringify(conversation.publicState());
const agent=new Agent({conversation,model,trace});const results=[];
for(const question of ['Remember Heathrow as my home airport.','Do you store my card details?']){const result=await agent.respond(question);results.push({question,result});console.log(JSON.stringify({question,result}));}
if(!results[0].result.proposedPreferences?.homeAirport)throw Error('Missing preference proposal');
if(before!==JSON.stringify(conversation.publicState()))throw Error('Policy/preference detour changed trip');
mkdirSync('eval-results/preference-smoke',{recursive:true});writeFileSync('eval-results/preference-smoke/report.json',JSON.stringify({results,calls:model.calls,tripPreserved:true,events},null,2));
