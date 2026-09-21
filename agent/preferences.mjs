import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {resolveLocation} from './search.mjs';
export function validatePreferences(p) {
 if(!p||Array.isArray(p)||typeof p!=='object'||Object.keys(p).some(k=>!['homeAirport','cabin','preferNonstop'].includes(k)))throw Error('Unsupported preference.');
 if(p.homeAirport!==undefined&&(!/^[A-Z]{3}$/.test(p.homeAirport)||!resolveLocation(p.homeAirport).some(a=>a.code===p.homeAirport)))throw Error('Choose a recognized three-letter airport code.');
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
 if(p.homeAirport){conversation.state.origin=resolveLocation(p.homeAirport)[0];conversation.state.originFromPreference=true;}
 if(p.cabin){conversation.state.cabin=p.cabin==='premium_economy'?'premium':p.cabin;conversation.state.cabinSource='preference';}
 if(p.preferNonstop)conversation.state.sort='nonstop';
}
export const preferencesTool={type:'function',function:{name:'travel_preferences',description:'Show saved defaults or propose changes only when explicitly asked to remember, save, change defaults, or forget. Proposal requires the user to press Save in dashboard; never claims already saved. Current-trip changes use find_flights.',parameters:{type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:['show','propose']},homeAirport:{type:['string','null'],description:'A specific airport name or three-letter IATA code, e.g. Heathrow or LHR. Ask which airport if the city has several. Null forgets the saved airport.'},cabin:{type:['string','null'],enum:['economy','premium_economy','business','first',null]},preferNonstop:{type:['boolean','null']}}}}};
export function preferenceAction(args,saved) {
 if(!args||typeof args!=='object'||Array.isArray(args)||!['show','propose'].includes(args.action)||Object.keys(args).some(k=>!['action','homeAirport','cabin','preferNonstop'].includes(k)))throw Error('Invalid preference action.');
 if(args.action==='show')return {status:'preferences',text:`Saved preferences\nHome airport: ${saved.homeAirport??'Not set'}\nCabin: ${saved.cabin??'Business class'}\nNonstop: ${saved.preferNonstop?'Preferred':'No preference'}`,preferences:saved};
 const next={...saved};for(const k of ['homeAirport','cabin','preferNonstop'])if(k in args){if(args[k]===null)delete next[k];else next[k]=args[k];}
 if(typeof next.homeAirport==='string'){const matches=resolveLocation(next.homeAirport);if(matches.length!==1||!/^[A-Z]{3}$/.test(matches[0].code))throw Error('Which specific airport would you like to save as your home airport?');next.homeAirport=matches[0].code;}
 validatePreferences(next);
 return {status:'preferences',text:'Review the proposed defaults in Saved preferences, then press Save defaults. Nothing has been saved yet. Changes apply to new conversations. This trip stays unchanged.',proposedPreferences:next};
}
