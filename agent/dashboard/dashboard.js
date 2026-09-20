const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=s=>JSON.stringify(s,null,2);
const short=m=>({'gpt-6-astra':'Astra','gpt-5.6-luna':'Luna','openai/gpt-5.6-terra':'Terra medium','anthropic/claude-sonnet-4.6':'Claude Sonnet 4.6'}[m]||m.replace('gpt-',''));
const median=xs=>{const a=[...xs].sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:0;};
const families={G:'Conversation and authority boundaries',A:'Ambiguity and unsupported constraints',N:'Nearby alternatives',L:'Live public staging',S:'Staging integration',R:'Complete route',M:'Missing information',D:'Dates',F:'Follow-up changes',U:'Unsupported request',E:'API failure or empty results',V:'Input validation'};
const explanations={R1:'London → New York; R2–R5 cover four other routes. With both cities and 1 October supplied, search immediately using the business default.',R2:'New York → San Francisco on 1 October. Search immediately; preserve the city airport groups and use business.',R3:'San Francisco → Singapore on 1 October. Search immediately; preserve the city airport groups and use business.',R4:'Singapore → Dubai on 1 October. Search immediately; preserve the city airport groups and use business.',R5:'Dubai → London on 1 October. Search immediately; preserve the city airport groups and use business.',M1:'Origin only: ask for the destination before searching. Then interpret a numbered menu choice and apply the date and cabin defaults.',M2:'Destination only: ask for the origin before searching. Then interpret a numbered menu choice and apply the date and cabin defaults.',M3:'Both cities, no date: search using 18–25 September and business. Do not ask an unnecessary date question.',D1:'Resolve “next week” against the fixed test clock: 21–27 September 2026.',F1:'Three turns: economy under $600; narrow to Heathrow; switch to business. Preserve the unchanged preferences, including the budget. Return no matches if nothing qualifies.',U1:'Round trip is outside this version. Explain the limitation without silently searching one-way.',U2:'Two travelers are outside this version. Clarify before searching instead of assuming one traveler.',E1:'Simulated API outage: say the search is unavailable rather than claiming there are no flights.',E2:'Successful search with no matches: return an empty result, not an outage.',V1:'Reject 30 February before calling the search API.'};
let data=null,chosen=null,activeRun=new URLSearchParams(location.search).get('run')||'',tab='conversation',lastSignature='',busy=false;
function selectedRuns(){return data.report.results.filter(r=>r.caseId===chosen?.caseId&&r.model===chosen?.model);}
const defaultMethod=$('#run-method').innerHTML;
const defaultExplanation=$('#run-explanation').textContent;
function render(){
 const isStaging=data.report.flightData==='staging';
 $('#judge-banner').hidden=true;
 $('#data-intro').textContent=isStaging?'Real model interpretation and real authenticated CommonSwyft staging search. These are integration checks, not a production reliability score.':'Recorded model acceptance checks with controlled flight fixtures. Every result shown comes from a preserved run.';
 $('#flight-source').textContent=isStaging?'Staging API returns flights':'Simulated API returns flights';
 $('#run-explanation').textContent=isStaging?`Your sentence is interpreted by ${short(data.report.models?.[0]??'the selected model')}. The application sends an authenticated search to CommonSwyft staging, validates the response and formats the shortlist. The login token is excluded from model prompts and this report. Opening this page only reads saved results.`:defaultExplanation;
 $('#run-method').innerHTML=isStaging?'<summary>What this staging test proves</summary><p><b>S = staging routes · M = missing details · F = follow-up changes.</b> Real model calls and authenticated staging searches. We check the route, date, cabin, defaults and retained preferences against expected behavior, then compare each displayed flight against the captured backend snapshot. An empty result can pass the flow checks but does not test displayed offer fields.</p><p>This is not a repeated accuracy benchmark. Staging can return cached availability; a price is not a checkout quote. No checkout or booking was attempted. Nearby-date alternatives can appear and are explicitly labelled. The conversation shows actual reply text, not a WhatsApp preview.</p>':defaultMethod;

 if(data.report.evaluationKind==='llm-judge-hardening'){
 $('#judge-banner').hidden=false;
 $('#judge-banner-copy').textContent=`${data.report.results.filter(row=>row.communicationPass).length} of ${data.report.results.length} replies cleared the judge threshold in this saved run. Exact checks still decide whether routes, dates, state and tool behavior are correct.`;
 $('#data-intro').textContent='Held-out Terra conversations graded with exact checks and an independent LLM judge.';
 $('#flight-source').textContent='Controlled fixtures and policy evidence';
 $('#run-explanation').textContent='Terra proposes each action. Code checks routes, dates, state and tool behavior. Claude Sonnet independently scores the visible reply. A judge score cannot override an exact failure.';
 $('#run-method').innerHTML='<summary>How to read the judge</summary><p><b>Exact checks remain authoritative.</b> The LLM judge reviews clarity, concision, tone, next step, honest limitations and internal leakage. A pass requires every score to be at least 4 out of 5, no major or critical issue and all exact checks to pass.</p><p>Each held-out case runs once. The judge sees the requirement and visible conversation but not the candidate model name or private reasoning. Review disagreements manually before changing prompts or scope.</p>';
 }
 if(data.report.flightData==='mixed'){
 $('#data-intro').textContent='Terra medium · 17 synthetic edge cases + 1 live public staging case (L1). One attempt per case; actual replies, not a production reliability score.';
 $('#flight-source').textContent='L1: staging · others: synthetic';
 $('#run-explanation').textContent='Terra interprets requests; the app validates tools, retains trip state and formats results. L1 calls CommonSwyft public staging without account credentials. Other cases use controlled fixtures. No payments or bookings were attempted.';
 $('#run-method').innerHTML='<summary>What this acceptance test proves</summary><p>18 scenarios, 20 model calls, Terra medium. Missing details, follow-ups, ambiguity, nearby results, unsupported requests and conversation boundaries. G1 allows a legitimate request with swearing; G2–G4 check insult bait, injection and purchase requests. L1 compares displayed flight details with the live response.</p><p>One pass per case is diagnostic evidence only. Tone also received human review; lexical checks are not a moderation service. The live response was verified in memory but its raw snapshot was not saved for replay.</p>';
 }
 const {report:r,cases}=data;const total=cases.length*r.models.length*r.repeats,completed=r.results.length,passed=r.results.filter(x=>x.pass).length;
 const judgeRows=r.results.filter(row=>row.judge),judgeStat=judgeRows.length?`<article class="stat"><small>Independent LLM judge</small><div class="value">${judgeRows.filter(row=>row.communicationPass).length}<span class="quiet"> / ${judgeRows.length}</span></div><div class="sub">Replies cleared · ${esc(short(r.judge?.model||'Independent judge'))}<br>Open a case to read its audit</div></article>`:'';
 $('#summary').innerHTML=`<article class="stat"><small>Scenarios checked</small><div class="value">${completed}<span class="quiet"> / ${total}</span></div><div class="sub">${passed} passed · ${completed-passed} failed · ${total-completed} pending</div></article>`+judgeStat+r.models.map(m=>{
   const rows=r.results.filter(x=>x.model===m),calls=rows.flatMap(x=>x.events.filter(e=>e.type==='model_usage').map(e=>e.data));
   const tokens=calls.reduce((n,c)=>n+(c.usage?.prompt_tokens??c.usage?.input_tokens??0)+(c.usage?.completion_tokens??c.usage?.output_tokens??0),0);
   return `<article class="stat"><small>${esc(short(m))} · ${esc(r.effort)} reasoning</small><div class="value">${calls.length?(median(calls.map(c=>c.latencyMs))/1000).toFixed(2)+' s':'—'}</div><div class="sub">Median model time · ${rows.filter(x=>x.pass).length}/${rows.length} cases passed<br>${tokens.toLocaleString()} tokens · ${calls.length} model calls</div></article>`;
 }).join('');
 $('#progress-title').textContent=r.summary?(completed===total?'Evaluation finished':'Stopped with partial results'):`${completed} of ${total} scenarios recorded`;
 $('#progress-meta').textContent=`${cases.length} cases × ${r.repeats} repeats × ${r.models.length} models`;
 $('#progress').max=total;$('#progress').value=completed;
 const recent=r.results.at(-1);$('#recent').textContent=recent?`Latest: ${short(recent.model)} · ${recent.caseId} ${recent.name} · repeat ${recent.repeat} · ${recent.pass?'passed':'failed'}`:'Waiting for the first result…';
 const filtered=cases.filter(c=>!$('#failures').checked||r.results.some(x=>x.caseId===c.id&&!x.pass));
 $('#matrix').innerHTML=filtered.length?`<table><thead><tr><th>Test case</th>${r.models.map(m=>`<th>${esc(short(m))}</th>`).join('')}</tr></thead><tbody>${filtered.map(c=>`<tr><td><span class="case-name">${esc(c.name)}</span><span class="case-id">${esc(c.id)} · ${esc(c.category||families[c.id[0]]||'Test case')}</span></td>${r.models.map(m=>{
   const runs=r.results.filter(x=>x.caseId===c.id&&x.model===m),n=runs.filter(x=>x.pass).length;
   return `<td><button class="score ${!runs.length?'pending':n===runs.length?'good':'bad'} ${chosen?.caseId===c.id&&chosen?.model===m?'selected':''}" data-case="${esc(c.id)}" data-model="${esc(m)}" aria-label="${esc(c.name)}, ${esc(short(m))}: ${n} of ${runs.length} passed, ${r.repeats} planned"><strong>${n}<span class="quiet"> / ${r.repeats}</span></strong><span class="dots">${Array.from({length:r.repeats},(_,i)=>{const run=runs.find(x=>x.repeat===i+1);return run?(run.pass?'✓':'×'):'·';}).join(' ')}</span></button></td>`;
 }).join('')}</tr>`).join('')}</tbody></table>`:'<div class="empty">No failed cases in the recorded results.</div>';
 $('#matrix').querySelectorAll('button').forEach(b=>b.onclick=()=>{const firstFailure=r.results.find(x=>x.caseId===b.dataset.case&&x.model===b.dataset.model&&!x.pass);chosen={caseId:b.dataset.case,model:b.dataset.model,repeat:firstFailure?.repeat??1};if(r.evaluationKind==='llm-judge-hardening')tab='judge';render();});
 renderDetail();
}
function renderDetail(){
 if(!chosen){$('#detail').innerHTML='<div class="empty">Choose a result to inspect it.</div>';return;}
 const c=data.cases.find(c=>c.id===chosen.caseId),runs=selectedRuns(),run=runs.find(x=>x.repeat===chosen.repeat);
 const usages=run?.events.filter(e=>e.type==='model_usage').map(e=>e.data)??[];
 const tabs=['conversation','checks',...(run?.judge?['judge']:[]),'trace'];if(!tabs.includes(tab))tab='conversation';
 const labels={conversation:'Conversation',checks:'Expected vs actual',judge:'LLM judge',trace:'Actions & usage'};
 const judgeBody=run?.judge?`<div class="tool"><h3>${esc(run.judge.verdict.replace('_',' '))}</h3><p>${esc(run.judge.rationale)}</p></div><h3>Scores</h3>${Object.entries(run.judge.scores).map(([name,score])=>`<div class="check"><span class="${score>=4?'pass':'fail'}">${score>=4?'✓':'×'}</span> ${esc(name)}: <b>${score}/5</b></div>`).join('')}<h3>Issues</h3>${run.judge.issues.length?run.judge.issues.map(issue=>`<div class="tool"><h3>${esc(issue.severity)} · ${esc(issue.criterion)}</h3><p>${esc(issue.evidence)}</p><p><b>Recommendation:</b> ${esc(issue.recommendation)}</p></div>`).join(''):'<p class="quiet">No issues recorded.</p>'}<p><b>Recommended next action:</b> ${esc(run.judge.recommendedAction.replaceAll('_',' '))}</p>`:'';
 let body;
 if(!run)body=`<p class="quiet">This repetition has not completed.</p>${c.steps.map(s=>`<div class="message user"><div class="speaker">Planned request</div><div class="bubble">${esc(s.text)}</div></div><pre>${esc(pretty(s.expected))}</pre>`).join('')}`;
 else if(tab==='conversation')body='<p class="quiet">Actual message text from this run. This is not a WhatsApp rendering preview.</p>'+run.steps.map(s=>`<div class="message user"><div class="speaker">You</div><div class="bubble">${esc(s.input)}</div></div><div class="message"><div class="speaker">Flight agent · ${(s.latencyMs/1000).toFixed(2)} s</div><div class="bubble">${esc(s.result.text)}</div></div>`).join('');
 else if(tab==='checks')body=run.steps.map((s,i)=>`<h3>Turn ${i+1} · ${esc(s.input)}</h3>${s.grade.checks.map(check=>`<div class="check"><span class="${check.pass?'pass':'fail'}">${check.pass?'✓':'×'}</span> ${esc(check.name)}${'expected'in check?`<details ${check.pass?'':'open'}><summary>Compare values</summary><pre>Expected: ${esc(pretty(check.expected))}\nActual: ${esc(pretty(check.actual))}</pre></details>`:''}</div>`).join('')}<br>`).join('');
 else if(tab==='judge')body=judgeBody;
 else body=run.events.filter(e=>['tool_call','tool_argument_repair','flight_api','model_usage','judge_usage','model_failure','search_result','policy_retrieval','policy_answer','policy_failure'].includes(e.type)).map(e=>`<div class="tool"><h3>${esc({'tool_call':'Proposed action','tool_argument_repair':'Harness preserved explicit fields','flight_api':e.data.mode==='staging'?'Staging API call':'Simulated API call','model_usage':'Candidate timing and tokens','judge_usage':'Judge timing and tokens','model_failure':'Model failure','search_result':'Search result','policy_retrieval':'Policy retrieval','policy_answer':'Policy answer','policy_failure':'Policy failure'}[e.type])}</h3><pre>${esc(pretty(e.data))}</pre></div>`).join('');
 $('#detail').innerHTML=`<div class="detail-head"><span class="badge">${esc(short(chosen.model))} · ${esc(c.id)}</span><h2>${esc(c.name)}</h2><p class="quiet">${esc(c.requirement||c.description||explanations[c.id]||'See Expected vs actual for this case.')}</p><div class="meta"><span class="${run?(run.pass?'pass':'fail'):''}">${run?(run.pass?'✓ All checks passed':'× Review needed'):'Not run yet'}</span>${run?`<span>${(usages.reduce((n,u)=>n+u.latencyMs,0)/1000).toFixed(2)}s candidate model time</span>`:''}</div><div class="repeats">${Array.from({length:data.report.repeats},(_,i)=>`<button class="repeat ${chosen.repeat===i+1?'selected':''}" data-repeat="${i+1}" aria-label="Repetition ${i+1}">${i+1} ${runs.find(r=>r.repeat===i+1)?(runs.find(r=>r.repeat===i+1).pass?'✓':'×'):'·'}</button>`).join('')}</div></div><div class="tabs" role="tablist" aria-label="Test detail">${tabs.map(name=>`<button class="tab ${tab===name?'active':''}" data-tab="${name}" role="tab" aria-selected="${tab===name}">${labels[name]}</button>`).join('')}</div><div class="detail-body" role="tabpanel">${body}</div>`;
 $('#detail').querySelectorAll('[data-repeat]').forEach(b=>b.onclick=()=>{chosen.repeat=Number(b.dataset.repeat);renderDetail();});
 $('#detail').querySelectorAll('[data-tab]').forEach((b,i)=>{b.tabIndex=b.dataset.tab===tab?0:-1;b.onclick=()=>{tab=b.dataset.tab;renderDetail();};b.onkeydown=e=>{if(!['ArrowRight','ArrowLeft'].includes(e.key))return;e.preventDefault();tab=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];renderDetail();$('#detail').querySelector(`[data-tab="${tab}"]`).focus();};});
}
async function refresh(){
 if(busy)return;busy=true;
 try{
  const list=await(await fetch('/api/runs')).json();
  if(!list.runs?.length){$('#connection').textContent='No evaluation reports yet.';return;}
  if(!activeRun)activeRun=list.runs[0];
  if([...$('#run').options].map(x=>x.value).join('|')!==list.runs.join('|'))$('#run').innerHTML=list.runs.map(id=>`<option value="${esc(id)}">${esc(id.replace('live-','').replace('T',' · ').replace(/\.\d+Z$/, ' UTC'))}</option>`).join('');
  $('#run').value=activeRun;
  const res=await fetch('/api/report?id='+encodeURIComponent(activeRun));if(!res.ok)throw new Error('Report is updating; keeping the last results.');
  data=await res.json();const sig=activeRun+data.updatedAt;
  if(data.report.label)$('#run').selectedOptions[0].textContent=(data.report.evaluationKind==='llm-judge-hardening'?'LLM judge · ':'')+data.report.label;
  $('#progress-meta').title=data.report.label||activeRun;
  if(!chosen||!data.cases.some(c=>c.id===chosen.caseId))chosen={caseId:data.cases[0].id,model:data.report.models[0],repeat:1};
  if(sig!==lastSignature){render();lastSignature=sig;}
  const age=Math.max(0,Math.round((Date.now()-Date.parse(data.updatedAt))/1000));
  $('#connection').textContent=data.report.summary?'Saved results · auto-refresh on':`Auto-refresh · latest result ${age}s ago${age>120?' · no new result yet':''}`;
  $('#alert').hidden=true;
 }catch(e){$('#connection').textContent='Connection paused';$('#alert').hidden=false;$('#alert').textContent=e.message;}finally{busy=false;}
}
$('#run').onchange=()=>{activeRun=$('#run').value;lastSignature='';chosen=null;refresh();};
$('#failures').onchange=()=>data&&render();
let dark=localStorage.getItem('flight-lab-theme')==='dark';
function setTheme(){document.body.classList.toggle('dark',dark);$('#theme').textContent=dark?'Light mode':'Dark mode';}
$('#theme').onclick=()=>{dark=!dark;localStorage.setItem('flight-lab-theme',dark?'dark':'light');setTheme();};setTheme();
refresh();setInterval(refresh,2500);
