import { readFile, readdir } from 'node:fs/promises';
export const queryKey = q => JSON.stringify(['origin','destination','dateFrom','dateTo','selectedDate','cabin'].map(k => k === 'cabin' ? q[k] || 'any' : q[k]));
export async function loadCaptures(root = new URL('./eval-results/', import.meta.url)) {
  const entries=[];
  for(const directory of await readdir(root,{withFileTypes:true})) {
    if(!directory.isDirectory() || !directory.name.startsWith('live-staging-')) continue;
    try { const data=JSON.parse(await readFile(new URL(`${directory.name}/captures.json`,root),'utf8')); entries.push(...data); } catch(e) { if(e.code!=='ENOENT') throw e; }
  }
  return entries.sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
}
export function makeReplayAdapter({captures,trace=()=>{}}) {
  const index=new Map(captures.map(c=>[queryKey(c.query),c]));
  const calls=[], snapshots=[];
  return {mode:'replay',calls,snapshots,async search(query){
    const capture=index.get(queryKey(query));
    if(!capture) throw new Error('This exact search was not recorded. Choose a recorded example, or reconnect live staging. No invented results or live fallback were used.');
    const snapshot=structuredClone(capture.snapshot);
    calls.push({method:'POST',mode:'replay',path:'recorded flight search',body:structuredClone(query)});
    trace('flight_api',{mode:'replay',method:'POST',body:query,capturedAt:capture.capturedAt});
    snapshots.push(snapshot);return snapshot;
  }};
}
