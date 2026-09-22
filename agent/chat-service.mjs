import {localPreferenceStore,applyPreferences} from './preferences.mjs';
import { HOSTED_MODEL_OPTIONS,hostedModelSettings } from './hosted-model-options.mjs';
import { randomUUID } from 'node:crypto';
import { Agent,OpenRouterModel,PROMPT_VERSION } from './model.mjs';
import { SearchConversation,isoToday,welcomeFor,fullAirport } from './search.mjs';
import { isVisitorId,turnRecords } from './store.mjs';
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
export function createChatService({modelFactory=defaultModelFactory,capturesLoader=loadCaptures,status=connectionStatus,stagingFactory=makeStagingAdapter,preferenceStore=localPreferenceStore(),modelOptions=HOSTED_MODEL_OPTIONS,settingsFor=hostedModelSettings,defaultModel='openai/gpt-5.6-terra',defaultEffort='medium',maxTotalTurns=40,maxSessions=8,maxSessionTurns=15,idleMs=3600000,conversationStore=null}={}) {
 const sessions=new Map();let turns=0,active=false;
 // Conversation storage, off unless a store is passed in. Writes queue per
 // conversation after the reply is sent and a failure is traced, never shown.
 const writes=new Set();
 const queue=(s,label,work)=>{if(!s.store)return;const p=(s.store.chain??Promise.resolve()).then(work).catch(error=>s.trace('store_error',{label,message:error instanceof Error?error.message:String(error)}));s.store.chain=p;writes.add(p);p.finally(()=>writes.delete(p));};
 // Deals shown on a welcome, by key, so the conversation that starts next can
 // answer "1" with the same deal the traveler saw. Short-lived and bounded.
 const welcomeOffers=new Map(),OFFER_MS=15*60*1000;
 const pruneOffers=()=>{for(const [k,v] of welcomeOffers)if(Date.now()-v.at>OFFER_MS)welcomeOffers.delete(k);while(welcomeOffers.size>100)welcomeOffers.delete(welcomeOffers.keys().next().value);};
 const welcomeText=(mode,preferences)=>{const savedLabels=[
   preferences.homeAirport ? 'Home airport: '+fullAirport(preferences.homeAirport) : null,
   preferences.cabin ? {economy:'Economy',premium_economy:'Premium economy',business:'Business class',first:'First class'}[preferences.cabin] : null,
   preferences.preferNonstop===true ? 'Prefer nonstop flights' : preferences.preferNonstop===false ? 'Open to connecting flights' : null,
  ].filter(Boolean);
  return welcomeFor(mode==='staging-public'?'staging':mode)+(savedLabels.length?'\n\nYour saved preferences: '+savedLabels.join(' · ')+'.':'');};
 const prune=()=>{for(const [id,s] of sessions)if(!s.busy&&Date.now()-s.updated>idleMs)sessions.delete(id);};
 return {
 async status(){const captures=await capturesLoader(),defaults=settingsFor(defaultModel,defaultEffort);return {preferences:await preferenceStore.read(),preferenceProfile:preferenceStore.label,live:await status(),publicSearch:{available:true,verifiedAt:'2026-09-19',accountLinked:false},models:modelOptions,model:defaults.model,label:defaults.label,effort:defaults.effort,remainingTurns:Math.max(0,maxTotalTurns-turns),replay:{available:captures.length>0,clock:captures.at(-1)?.clock,examples:[...new Set(captures.map(c=>c.input))].filter(x=>typeof x==='string'&&/ to /i.test(x))}};},
 async savePreferences(p){if(active)throw Error('Wait for the current reply before saving defaults.');const saved=await preferenceStore.replace(p);for(const s of sessions.values())s.agent.preferences=saved;return {preferences:saved,profile:preferenceStore.label};},
 // The welcome, before any chat exists, so the page can show it at once.
 async welcome(mode){if(!['staging','staging-public','replay'].includes(mode))throw new Error('Choose live staging or recorded staging.');return {text:welcomeText(mode,await preferenceStore.read())};},
 // "Great deals this week", fetched separately so a slow or failed deals feed
 // never delays or breaks the welcome. Null text means show nothing.
 async welcomeDeals(mode){
  if(mode!=='staging-public'&&mode!=='staging')return {text:null};
  const trace=()=>{},adapter=stagingFactory({trace,maxSearches:0,authMode:'public'});
  const offer=await new SearchConversation({adapter,today:()=>isoToday(),trace}).welcomeDeals();
  if(!offer)return {text:null};
  pruneOffers();welcomeOffers.set(offer.key,{choices:offer.choices,at:Date.now()});
  return {text:offer.text,key:offer.key};
 },
 async start(mode,model=defaultModel,effort=defaultEffort,welcomeKey=null,visitorId=null){
  const settings=settingsFor(model,effort);
  prune();if(!['staging','staging-public','replay'].includes(mode))throw new Error('Choose live staging or recorded staging.');
  if(sessions.size>=maxSessions)throw new Error('The demo is at its active-chat limit. Close a chat before starting another.');
  if(mode==='staging'&&!(await status()).connected)throw new Error('Staging login has expired. Reconnect the staging session, or use recorded mode meanwhile.');
  const captures=mode==='replay'?await capturesLoader():[];
  if(mode==='replay'&&!captures.length)throw new Error('No recorded staging searches are available yet.');
  const clock=mode==='replay'?captures.at(-1).clock:isoToday();
  const events=[],trace=(type,data)=>events.push({type,data});
  const adapter=mode==='replay'?makeReplayAdapter({captures,trace}):stagingFactory({trace,maxSearches:12,authMode:mode==='staging-public'?'public':'session'});
  const conversation=new SearchConversation({adapter,today:()=>clock,trace});
  const preferences=await preferenceStore.read();applyPreferences(conversation,preferences);
  pruneOffers();const offer=typeof welcomeKey==='string'?welcomeOffers.get(welcomeKey):null;if(offer)conversation.offerDeals(offer.choices);
  // Memory: with no saved home airport, the last origin this browser searched
  // from becomes a disclosed default. Only the origin is remembered.
  let store=null,rememberedOrigin=false;
  if(conversationStore&&isVisitorId(visitorId)){
   try{
    await conversationStore.touchVisitor(visitorId);
    const memory=await conversationStore.memory(visitorId);
    if(!preferences.homeAirport&&memory.lastOrigin)rememberedOrigin=conversation.rememberOrigin(memory.lastOrigin);
    store={visitorId,conversationId:await conversationStore.startConversation({visitorId,model:settings.model,promptVersion:PROMPT_VERSION}),seq:0,chain:null};
   }catch(error){trace('store_error',{label:'start',message:error instanceof Error?error.message:String(error)});store=null;}
  }
  const agent=new Agent({conversation,preferences,model:await modelFactory(trace,settings),trace});
  const id=randomUUID();sessions.set(id,{agent,adapter,conversation,events,mode,settings,updated:Date.now(),busy:false,turns:0,store:store?{...store,api:conversationStore}:null,trace});
  return {id,mode,clock,...settings,text:welcomeText(mode,preferences)+(rememberedOrigin?`\n\nUsing ${conversation.publicState().origin.label} from your last search. Say where you’re flying from to change it.`:''),dealsOffered:Boolean(offer),remembered:rememberedOrigin};
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
   if(s.store){
    const records=turnRecords({text,result,toolCalls:events.filter(e=>e.type==='tool_call').map(e=>e.data),latencyMs});
    const from=s.store.seq;s.store.seq+=records.length;
    queue(s,'turn',()=>s.store.api.appendMessages(s.store.conversationId,from,records));
    const state=s.conversation.publicState();
    // Remember an origin the traveler chose, never a default we filled in.
    if(result.status==='results'&&state.origin?.code&&!state.originFromPreference)queue(s,'memory',()=>s.store.api.rememberLastOrigin(s.store.visitorId,state.origin.code));
   }
   return {result,settings:s.settings,state:s.conversation.publicState(),events,grounding,latencyMs,timing:{modelLatencyMs,flightSearchLatencyMs,otherLatencyMs,totalLatencyMs:latencyMs},remainingTurns:maxTotalTurns-turns};
  }finally{s.busy=false;active=false;s.updated=Date.now();}
 },
 // Wait for queued storage writes; for tests and orderly shutdown.
 async settle(){await Promise.allSettled([...writes]);},
 close(id){const s=sessions.get(id);if(s?.busy)throw new Error('Wait for the current reply before resetting.');sessions.delete(id);return {closed:true};}
 };
}
