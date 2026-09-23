import {gradeStep} from './edge-cases.mjs';

const baseKeys=new Set(['status','statuses','origin','destination','cabin','from','to','budget','pending','menuCount','posts','resultCount','minResults','mentions']);
const same=(actual,expected)=>Object.entries(expected).every(([key,value])=>actual?.[key]===value);

export function gradeV2Step(expected,result,conversation,adapter,savedPreferences={}){
 if(expected.outcomes){
  const alternatives=expected.outcomes.map(outcome=>gradeV2Step(outcome,result,conversation,adapter,savedPreferences));
  const match=alternatives.find(item=>item.pass);
  return match??{pass:false,actual:alternatives[0]?.actual,checks:[{name:'one allowed outcome',expected:expected.outcomes,actual:alternatives.map(item=>item.actual),pass:false}]};
 }
 const base=Object.fromEntries(Object.entries(expected).filter(([key])=>baseKeys.has(key)));
 const grade=gradeStep(base,result,conversation,adapter);
 const state=conversation.publicState();
 const checks=[...grade.checks];
 const add=(name,wanted,actual,pass)=>checks.push({name,expected:wanted,actual,pass});
 if('sort' in expected)add('sort',expected.sort,state.sort,state.sort===expected.sort);
 if('nonstopOnly' in expected)add('nonstopOnly',expected.nonstopOnly,state.nonstopOnly,state.nonstopOnly===expected.nonstopOnly);
 if('hasSource' in expected)add('has policy source',expected.hasSource,result.sources?.length>0,(result.sources?.length>0)===expected.hasSource);
 if(expected.sourceOrSupport)add('policy source or support handoff',true,result.sources?.length?result.sources:result.text,Boolean(result.sources?.length||/support@commonswyft\.com/i.test(result.text)));
 if(expected.containsOnce){const count=result.text.split(expected.containsOnce).length-1;add('text occurs once',expected.containsOnce,count,count===1);}
 if(expected.proposedPreferences)add('proposed preferences',expected.proposedPreferences,result.proposedPreferences,same(result.proposedPreferences,expected.proposedPreferences));
 if(expected.savedPreferences)add('saved preferences',expected.savedPreferences,savedPreferences,same(savedPreferences,expected.savedPreferences)&&Object.keys(savedPreferences).length===Object.keys(expected.savedPreferences).length);
 return {pass:checks.every(check=>check.pass),actual:{...grade.actual,sort:state.sort,nonstopOnly:state.nonstopOnly,sources:result.sources??[],proposedPreferences:result.proposedPreferences,savedPreferences},checks};
}

// Cross-conversation memory as the product applies it when storage is on:
// the last origin the traveler chose carries into the next conversation as a
// disclosed default, unless a saved home airport exists. Nothing else carries.
export function rememberFromStep(memory,result,conversation){
 const state=conversation.publicState();
 if(result?.status==='results'&&state.origin?.code&&!state.originFromPreference)memory.lastOrigin=state.origin.code;
}
export function applyMemory(memory,conversation,savedPreferences={}){
 return !savedPreferences.homeAirport&&memory.lastOrigin?conversation.rememberOrigin(memory.lastOrigin):false;
}
