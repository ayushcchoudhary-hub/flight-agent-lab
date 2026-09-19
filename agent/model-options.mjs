// Explicit choices advertised by this Codex host. No silent model substitution.
export const MODEL_OPTIONS = [
  {id:'gpt-6-astra',label:'Astra',efforts:['low','medium','high']},
  {id:'gpt-5.6-luna',label:'Luna',efforts:['low','medium','high']},
  {id:'gpt-5.6-sol',label:'Sol',efforts:['low','medium','high']},
  {id:'gpt-5.6-terra',label:'Terra',efforts:['low','medium','high']},
];
export function modelSettings(model='gpt-6-astra',effort='low') {
 const option=MODEL_OPTIONS.find(o=>o.id===model);
 if(!option||!option.efforts.includes(effort))throw new Error('Choose a listed model and low, medium or high reasoning.');
 return {model,effort,label:option.label};
}
