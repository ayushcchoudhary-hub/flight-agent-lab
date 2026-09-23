import { labelForValue } from './shared.mjs';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {resolveLocation} from './search.mjs';
export function validatePreferences(p) {
 if(!p||Array.isArray(p)||typeof p!=='object'||Object.keys(p).some(k=>!['homeAirport','cabin','preferNonstop'].includes(k)))throw Error('Unsupported preference.');
 if(p.homeAirport!==undefined&&(!/^[A-Z]{3}(\|[A-Z]{3})*$/.test(p.homeAirport)||!resolveLocation(p.homeAirport).some(a=>a.code===p.homeAirport)))throw Error('Choose a recognized airport or city.');
 if(p.cabin!==undefined&&!['economy','premium_economy','business','first'].includes(p.cabin))throw Error('Choose a supported cabin.');
 if(p.preferNonstop!==undefined&&typeof p.preferNonstop!=='boolean')throw Error('Nonstop preference must be true or false.');
 return {...p};
}
export function localPreferenceStore(path=new URL('./local-state/preferences.json',import.meta.url)) {
 const file=path instanceof URL?path.pathname:path;
 return { label:'Local test profile · not linked to CommonSwyft',
 async read(){try{return validatePreferences(JSON.parse(await readFile(file,'utf8')));}catch(e){if(e.code==='ENOENT')return {};throw Error('Saved preferences could not be read.');}},
 async replace(p){p=validatePreferences(p);await mkdir(dirname(file),{recursive:true,mode:0o700});const tmp=file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(p),{mode:0o600});await rename(tmp,file);return p;},
 };
}
// Opt-in local backend connector: never targets staging or production. The
// caller supplies its own authenticated local-test token; identity is server-derived.
export function accountPreferenceStore({baseURL,token,fetchImpl=fetch,label='Authenticated local account API'}) {
 const url=new URL(baseURL);if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.search||url.hash)throw Error('Preferences API connector is local-backend only.');
 async function request(method,p){const r=await fetchImpl(new URL('/v1/me',url),{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(p?{body:JSON.stringify({travelPreferences:validatePreferences(p)})}:{})});if(!r.ok)throw Error(`Local account API returned HTTP ${r.status}.`);const data=await r.json();return validatePreferences(data.profile?.travelPreferences??{});}
 return {label,read:()=>request('GET'),replace:p=>request('PATCH',p)};
}
export function applyPreferences(conversation,p) {
 p=validatePreferences(p);
 if(p.homeAirport){conversation.state.origin=resolveLocation(p.homeAirport)[0];conversation.state.originFromPreference=true;conversation.state.originDefault='home';}
 if(p.cabin){conversation.state.cabin=p.cabin==='premium_economy'?'premium':p.cabin;conversation.state.cabinSource='preference';}
 if(p.preferNonstop)conversation.state.sort='nonstop';
}
export const preferencesTool={type:'function',function:{name:'travel_preferences',description:'Show saved defaults, save a home airport, or propose other defaults, only when the traveler explicitly asks to remember, save, change or forget one, or states their home airport or home city ("my home airport is Heathrow", "I live in London, save that"). A home airport is saved as soon as it is stated. A cabin or nonstop default is only a proposal the traveler confirms in the dashboard. A place mentioned only for this trip ("I am in Tokyo this week") is not a home airport. Current-trip changes use find_flights.',parameters:{type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:['show','propose']},homeAirport:{type:['string','null'],description:'The home airport or city the traveler stated, e.g. Heathrow, LHR or London. Omit or null when they did not state one.'},cabin:{type:['string','null'],enum:['economy','premium_economy','business','first',null]},preferNonstop:{type:['boolean','null']},forget:{type:'array',items:{type:'string',enum:['homeAirport','cabin','preferNonstop']},description:'Only when the traveler explicitly asks to forget or clear a saved default. Never implied by an omitted or null field.'}}}}};
// Product decision 2026-09-23: saying your home airport saves it, with no
// separate confirmation. Cabin and nonstop defaults stay proposals the
// traveler confirms (held-out D4). Where the saved home airport is stored is
// the chat service's job; this only decides and words it.
export function preferenceAction(args,saved) {
 if(!args||typeof args!=='object'||Array.isArray(args)||!['show','propose'].includes(args.action)||Object.keys(args).some(k=>!['action','homeAirport','cabin','preferNonstop','forget'].includes(k)))throw Error('Invalid preference action.');
 if('forget' in args&&(!Array.isArray(args.forget)||args.forget.some(f=>!['homeAirport','cabin','preferNonstop'].includes(f))))throw Error('Invalid preference action.');
 // Models send every field, null or empty for what the traveler never said.
 // Only an explicit forget removes anything: a null once wiped a saved home
 // airport when the traveler only asked to remember business (held-out D4).
 const forget=new Set(args.forget??[]);
 if(args.action==='show')return {status:'preferences',text:`Saved preferences\nHome airport: ${saved.homeAirport?labelForValue(saved.homeAirport):'Not set'}\nCabin: ${saved.cabin??'Business class'}\nNonstop: ${saved.preferNonstop?'Preferred':'No preference'}`,preferences:saved};
 const lines=[],out={status:'preferences'};
 if(forget.has('homeAirport')){out.savedPreferences={homeAirport:null};lines.push('Removed your saved home airport.');}
 else if(typeof args.homeAirport==='string'&&args.homeAirport.trim()){
  {
   const matches=resolveLocation(String(args.homeAirport));
   // One place, airport or city, is saved. Anything else is a question, never a guess.
   if(matches.length!==1)return {status:'clarify',text:`Which airport or city should I save as your home airport?${matches.length?` For example ${matches.slice(0,3).map(m=>m.label).join(', ')}.`:''}`};
   out.savedPreferences={homeAirport:matches[0].code};
   lines.push(`Saved ${matches[0].label} as your home airport. I’ll use it when you don’t say where you’re flying from.`);
  }
 }
 const others={};
 for(const k of ['cabin','preferNonstop']){if(forget.has(k))others[k]=null;else if(args[k]!==null&&args[k]!==undefined&&args[k]!==''&&!(k==='preferNonstop'&&args[k]===false&&!('preferNonstop' in saved)))others[k]=args[k];}
 if(Object.keys(others).length){
  const next={...saved};for(const [k,v] of Object.entries(others)){if(v===null)delete next[k];else next[k]=v;}
  if(out.savedPreferences?.homeAirport!==undefined){if(out.savedPreferences.homeAirport===null)delete next.homeAirport;else next.homeAirport=out.savedPreferences.homeAirport;}
  validatePreferences(next);
  out.proposedPreferences=next;
  lines.push(lines.length?'Review the other proposed defaults in Saved preferences, then press Save defaults. Nothing else has been saved yet.':'Review the proposed defaults in Saved preferences, then press Save defaults. Nothing has been saved yet.');
 }
 if(!lines.length)return {status:'clarify',text:'Tell me the home airport or city to save, or the default you want to change.'};
 out.text=lines.join('\n\n');
 return out;
}
