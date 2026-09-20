import {localPreferenceStore,applyPreferences} from './preferences.mjs';
import { HOSTED_MODEL_OPTIONS,hostedModelSettings } from './hosted-model-options.mjs';
import { randomUUID } from 'node:crypto';
import { Agent,OpenRouterModel } from './model.mjs';
import { SearchConversation,isoToday,welcomeFor,fullAirport } from './search.mjs';
import { makeStagingAdapter,readStagingToken } from './staging.mjs';
import { loadCaptures,makeReplayAdapter } from './replay.mjs';
import { verifyFlightData } from './verify-flight-data.mjs';
export async function connectionStatus() {
 try {
  const token=await readStagingToken(),payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
  const expiresAt=Number(payload.exp)*1000;
  return {reason:Number.isFinite(expiresAt)&&expiresAt>Date.now()+10000?'connected':'expired',connected:Number.isFinite(expiresAt)&&expiresAt>Date.now()+10000,expiresAt:Number.isFinite(expiresAt)?new Date(expiresAt).toISOString():null};
 } catch {return {connected:false,reason:'disconnected',expiresAt:null};}
}
const defaultModelFactory=(trace,settings)=>new OpenRouterModel({apiKey:process.env.OPENROUTER_API_KEY,model:settings.model,reasoningEffort:settings.effort,maxCalls:15,trace});
export function createChatService({modelFactory=defaultModelFactory,capturesLoader=loadCaptures,status=connectionStatus,stagingFactory=makeStagingAdapter,preferenceStore=localPreferenceStore(),modelOptions=HOSTED_MODEL_OPTIONS,settingsFor=hostedModelSettings,defaultModel='openai/gpt-5.6-terra',defaultEffort='medium',maxTotalTurns=40,maxSessions=8,maxSessionTurns=15,idleMs=3600000}={}) {
 const sessions=new Map();let turns=0,active=false;
 const prune=()=>{for(const [id,s] of sessions)if(!s.busy&&Date.now()-s.updated>idleMs)sessions.delete(id);};
 return {
 async status(){const captures=await capturesLoader(),defaults=settingsFor(defaultModel,defaultEffort);return {preferences:await preferenceStore.read(),preferenceProfile:preferenceStore.label,live:await status(),publicSearch:{available:true,verifiedAt:'2026-09-19',accountLinked:false},models:modelOptions,model:defaults.model,label:defaults.label,effort:defaults.effort,remainingTurns:Math.max(0,maxTotalTurns-turns),replay:{available:captures.length>0,clock:captures.at(-1)?.clock,examples:[...new Set(captures.map(c=>c.input))].filter(x=>typeof x==='string'&&/ to /i.test(x))}};},
 async savePreferences(p){if(active)throw Error('Wait for the current reply before saving defaults.');const saved=await preferenceStore.replace(p);for(const s of sessions.values())s.agent.preferences=saved;return {preferences:saved,profile:preferenceStore.label};},
 async start(mode,model=defaultModel,effort=defaultEffort){
  const settings=settingsFor(model,effort);
  prune();if(!['staging','staging-public','replay'].includes(mode))throw new Error('Choose live staging or recorded staging.');
  if(sessions.size>=maxSessions)throw new Error('The demo is at its active-chat limit. Close a chat before starting another.');
  if(mode==='staging'&&!(await status()).connected)throw new Error('Staging login has expired. Ask Codex to reconnect the signed-in staging tab. You can use recorded mode meanwhile.');
  const captures=mode==='replay'?await capturesLoader():[];
  if(mode==='replay'&&!captures.length)throw new Error('No recorded staging searches are available yet.');
  const clock=mode==='replay'?captures.at(-1).clock:isoToday();
  const events=[],trace=(type,data)=>events.push({type,data});
  const adapter=mode==='replay'?makeReplayAdapter({captures,trace}):stagingFactory({trace,maxSearches:12,authMode:mode==='staging-public'?'public':'session'});
  const conversation=new SearchConversation({adapter,today:()=>clock,trace});
  const preferences=await preferenceStore.read();applyPreferences(conversation,preferences);
  const agent=new Agent({conversation,preferences,model:await modelFactory(trace,settings),trace});
  const id=randomUUID();sessions.set(id,{agent,adapter,conversation,events,mode,settings,updated:Date.now(),busy:false,turns:0});
  const savedLabels=[
   preferences.homeAirport ? 'Home airport: '+fullAirport(preferences.homeAirport) : null,
   preferences.cabin ? {economy:'Economy',premium_economy:'Premium economy',business:'Business class',first:'First class'}[preferences.cabin] : null,
   preferences.preferNonstop===true ? 'Prefer nonstop flights' : preferences.preferNonstop===false ? 'Open to connecting flights' : null,
  ].filter(Boolean);
  return {id,mode,clock,...settings,text:welcomeFor(mode==='staging-public'?'staging':mode)+(savedLabels.length?'\n\nYour saved preferences: '+savedLabels.join(' · ')+'.':'')};
 },
 async turn(id,text){
  prune();const s=sessions.get(id);if(!s)throw new Error('This chat expired. Start a new chat.');
  if(typeof text!=='string'||!text.trim()||text.length>2000)throw new Error('Enter a message of 1–2,000 characters.');
  if(active||s.busy)throw new Error('A message is still running. Wait for its reply.');
  if(turns>=maxTotalTurns||s.turns>=maxSessionTurns)throw new Error('Demo message limit reached. No further model calls were made.');
  if(s.mode==='staging'&&!(await status()).connected)throw new Error('Staging login has expired. Reconnect before sending; no model call was made.');
  s.busy=true;active=true;turns++;s.turns++;s.updated=Date.now();
  try{
   const from=s.events.length,start=performance.now();const result=await s.agent.respond(text);
   const events=s.events.slice(from).filter(e=>['model_usage','model_retry','tool_call','action_latency','flight_api','flight_api_retry','search_result','policy_retrieval','policy_answer','policy_failure'].includes(e.type));
   const snapshot=s.adapter.snapshots.at(-1),query=s.adapter.calls.filter(c=>c.method==='POST').at(-1)?.body;
   const grounding=result.status==='results'&&snapshot?verifyFlightData(result,snapshot,query):null;
   const latencyMs=Math.round(performance.now()-start);
   const modelLatencyMs=events.filter(e=>e.type==='model_usage').reduce((total,e)=>total+(Number(e.data.latencyMs)||0),0);
   const usedFlightApi=events.some(e=>e.type==='flight_api');
   const flightSearchLatencyMs=usedFlightApi?events.filter(e=>e.type==='action_latency'&&e.data.name==='find_flights').reduce((total,e)=>total+(Number(e.data.latencyMs)||0),0):0;
   const otherLatencyMs=Math.max(0,latencyMs-modelLatencyMs-flightSearchLatencyMs);
   return {result,settings:s.settings,state:s.conversation.publicState(),events,grounding,latencyMs,timing:{modelLatencyMs,flightSearchLatencyMs,otherLatencyMs,totalLatencyMs:latencyMs},remainingTurns:maxTotalTurns-turns};
  }finally{s.busy=false;active=false;s.updated=Date.now();}
 },
 close(id){const s=sessions.get(id);if(s?.busy)throw new Error('Wait for the current reply before resetting.');sessions.delete(id);return {closed:true};}
 };
}
