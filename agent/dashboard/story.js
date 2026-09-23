// The reading order for the evals pages. Data comes from /api/story, which
// computes every number from the saved reports. This file only draws it.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MODEL_NAMES = { 'openai/gpt-5.6-terra': 'Terra', 'openai/gpt-6-sol': 'Sol', 'anthropic/claude-sonnet-4.6': 'Sonnet 4.6', 'anthropic/claude-opus-5': 'Opus 5', 'anthropic/claude-opus-5.5': 'Opus 5.5' };
export const modelName = m => MODEL_NAMES[m] ?? String(m ?? '').split('/').pop();
const OUTCOME = { pass: 'Passed', judge: 'Judge flagged wording', exact: 'Failed an exact check', missing: 'Not run' };
const chip = (item, run, kind = '') => `<button class="case-chip ${kind}" data-run="${esc(run)}" data-case="${esc(item.id)}" title="${esc(item.name)}">${esc(item.id)}</button>`;

export function storyRunLabel(story, key) {
  const i = story.milestones.findIndex(m => m.run === key);
  if (i >= 0) return `${i + 1} · ${story.milestones[i].date} · ${story.milestones[i].title}`;
  for (const pair of story.headToHead) { const r = pair.runs.find(x => x.run === key); if (r) return `${pair.date} · ${pair.title} · ${modelName(r.model)}`; }
  return null;
}

// Picker groups: milestones in order, head-to-head runs, supporting runs with
// their reason, then anything the story does not know (local unpublished runs).
export function pickerGroups(story, runs) {
  const placed = new Set();
  const milestones = story.milestones.map((m, i) => { m.run.split('+').forEach(p => placed.add(p)); placed.add(m.run); return { value: m.run, text: `${i + 1} · ${m.date} · ${m.title} · ${m.passed}/${m.cases}` }; });
  const h2h = story.headToHead.flatMap(pair => pair.runs.filter(r => !placed.has(r.run)).map(r => { r.run.split('+').forEach(p => placed.add(p)); placed.add(r.run); return { value: r.run, text: `${pair.title} · ${modelName(r.model)} · ${r.passed}/${r.cases}` }; }));
  const supporting = runs.filter(id => story.supporting[id]).map(id => { placed.add(id); return { value: id, text: `${id.slice(21, 31)} · ${story.supporting[id]}` }; });
  const option = id => ({ value: id, text: id.replace('live-', '').replace('T', ' · ').replace(/\.\d+Z$/, ' UTC') });
  const rest = runs.filter(id => !placed.has(id));
  const acceptance = rest.filter(id => !id.startsWith('live-hardening-')).map(option), unplaced = rest.filter(id => id.startsWith('live-hardening-')).map(option);
  return [['Milestones', milestones], ['Model head-to-head', h2h], ['Supporting runs (partial, split or targeted)', supporting], ['Not yet in the story', unplaced], ['Earlier acceptance runs, before the judge', acceptance]].filter(([, items]) => items.length);
}

function bar(m, i, maxCases, selected) {
  const h = n => `${(n / maxCases) * 100}%`;
  const added = m.delta?.added.length ?? 0;
  return `<button class="story-col ${selected ? 'selected' : ''}" data-index="${i}" aria-label="${esc(`${m.title}: ${m.passed} of ${m.cases} passed, ${m.exact} exact`)}">
    <span class="story-score"><b>${m.passed}</b>/${m.cases}</span>
    <span class="story-bar">
      <span class="seg exact" style="height:${h(m.exactFailed)}"></span>
      <span class="seg judge" style="height:${h(m.judgeOnly)}"></span>
      <span class="seg pass" style="height:${h(m.passed)}"></span>
    </span>
    <span class="story-exact">exact ${m.exact}/${m.cases}</span>
    <span class="story-step">${i + 1} · ${esc(m.date)}</span>
    <span class="story-title">${esc(m.title)}</span>
    <span class="story-tags">${added ? `<span class="tag added">+${added} cases</span>` : ''}${m.judgeChange ? '<span class="tag judge">new judge</span>' : ''}${m.parts > 1 ? `<span class="tag">${m.parts} parts</span>` : ''}</span>
  </button>`;
}

function group(title, items, run, kind, hint) {
  if (!items?.length) return '';
  return `<div class="delta-group"><h4>${esc(title)} <span class="quiet">${items.length}</span></h4><p class="quiet">${esc(hint)}</p><div>${items.map(x => chip(x, run, kind || x.outcome)).join('')}</div></div>`;
}

function detail(m, i, story) {
  const d = m.delta, prev = story.milestones[i - 1];
  const moves = d ? [
    group('Fixed', d.fixed, m.run, 'pass', 'Failed before, pass now.'),
    group('Now correct, wording flagged', d.nowCorrect, m.run, 'judge', 'Failed an exact check before. Exact checks pass now; the judge still wants clearer wording.'),
    group('New cases', d.added, m.run, '', 'Colored by how they did on this run.'),
    group('New exact failures', d.newExactFailures, m.run, 'exact', 'Behavior that got worse. These matter most.'),
    group('Newly flagged by the judge', d.newJudgeFlags, m.run, 'judge', m.judgeChange ? 'Exact checks still pass. The judge changed on this run, so some flags are the stricter judge, not a new problem.' : 'Exact checks still pass. The judge wants clearer wording.'),
  ].join('') : '';
  const change = d ? [
    `${m.passed - prev.passed >= 0 ? '+' : ''}${m.passed - prev.passed} passing`,
    d.added.length ? `+${d.added.length} new cases` : null,
    `${d.fixed.length} fixed`, `${d.newExactFailures.length} new exact failure${d.newExactFailures.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ') : 'Starting point';
  return `<div class="story-detail-head"><div><span class="badge">${i + 1} of ${story.milestones.length} · ${esc(m.date)}</span><h3>${esc(m.title)}</h3><p class="story-change">${esc(change)}</p></div>
    <button class="secondary" data-open="${esc(m.run)}">Open this run below ↓</button></div>
    <div class="story-detail-body"><div><h4>What changed</h4><ul>${m.changed.map(x => `<li>${esc(x)}</li>`).join('')}</ul><h4>Why</h4><p>${esc(m.why)}</p>
    <p class="quiet mini">${esc(modelName(m.model))} ${esc(m.effort ?? '')} · prompt ${esc(m.promptVersion)} · judge ${esc(modelName(m.judge?.model))} ${esc(m.judge?.effort ?? '')}${m.judgeChange ? ` (${esc(m.judgeChange)})` : ''}</p></div>
    <div>${moves || '<p class="quiet">The first run on the held-out set. Later runs are compared with the one before.</p>'}</div></div>`;
}

// Draw the chart and the selected milestone's detail. onOpen(run, caseId)
// opens a run (and optionally a case) in the explorer below.
export function renderStory(el, story, { selected = story.milestones.length - 1, onOpen }) {
  if (!story.milestones.length) { el.hidden = true; return; }
  el.hidden = false;
  const maxCases = Math.max(...story.milestones.map(m => m.cases));
  const draw = index => {
    el.innerHTML = `<div class="section-head"><div><h2>How the agent improved</h2><p class="quiet">Each bar is one complete run. Taller bars have more test cases. Click a bar to see what changed and why.</p></div>
      <div class="story-legend"><span><i class="pass"></i>Passed</span><span><i class="judge"></i>Exact checks pass, judge flagged the wording</span><span><i class="exact"></i>Failed an exact check</span></div></div>
      <div class="story-chart">${story.milestones.map((m, i) => bar(m, i, maxCases, i === index)).join('')}</div>
      <div class="story-detail">${detail(story.milestones[index], index, story)}</div>
      <p class="quiet mini story-before">${esc(story.before)} Exact checks decide whether routes, dates, state and tools are right. The judge only grades wording, and it changed twice, so the exact count under each bar is the steadier number to follow.</p>`;
    el.querySelectorAll('.story-col').forEach(b => b.onclick = () => draw(Number(b.dataset.index)));
    el.querySelectorAll('[data-case]').forEach(b => b.onclick = () => onOpen(b.dataset.run, b.dataset.case));
    el.querySelector('[data-open]').onclick = e => onOpen(e.currentTarget.dataset.open);
  };
  draw(Math.min(Math.max(0, selected), story.milestones.length - 1));
  // On a narrow screen the chart scrolls sideways: start on the selected bar.
  const chart = el.querySelector('.story-chart'), col = chart.querySelector('.selected');
  if (col) chart.scrollLeft = col.offsetLeft - (chart.clientWidth - col.clientWidth) / 2;
}

const money = n => Number.isFinite(n) ? `$${n.toFixed(2)}` : '—';
const secs = n => Number.isFinite(n) ? `${(n / 1000).toFixed(1)} s` : '—';

// One head-to-head: cards per model, then the cases where they disagree.
export function renderHeadToHead(el, story, index = story.headToHead.length - 1) {
  const pairs = story.headToHead;
  if (!pairs.length) { el.hidden = true; return; }
  el.hidden = false;
  const draw = i => {
    const pair = pairs[i], runs = pair.runs;
    const best = key => Math.max(...runs.map(r => r[key]));
    const cheapest = Math.min(...runs.map(r => r.costPer1000TurnsUsd)), fastest = Math.min(...runs.map(r => r.medianCallMs));
    const card = r => `<article class="h2h-card"><h3>${esc(modelName(r.model))} <span class="quiet">${esc(r.effort ?? '')}</span></h3>
      <div class="h2h-metric"><small>Cases passed</small><b class="${r.passed === best('passed') ? 'lead' : ''}">${r.passed}<span class="quiet">/${r.cases}</span></b><span class="h2h-bar"><span class="pass" style="width:${r.passed / r.cases * 100}%"></span><span class="judge" style="width:${r.judgeOnly / r.cases * 100}%"></span><span class="exact" style="width:${r.exactFailed / r.cases * 100}%"></span></span></div>
      <div class="h2h-metric"><small>Exact checks passed</small><b class="${r.exact === best('exact') ? 'lead' : ''}">${r.exact}<span class="quiet">/${r.cases}</span></b></div>
      <div class="h2h-metric"><small>Median model call</small><b class="${r.medianCallMs === fastest ? 'lead' : ''}">${secs(r.medianCallMs)}</b></div>
      <div class="h2h-metric"><small>Model cost per 1,000 traveler turns</small><b class="${r.costPer1000TurnsUsd === cheapest ? 'lead' : ''}">${money(r.costPer1000TurnsUsd)}</b></div>
      <a class="mini" href="/evals?run=${encodeURIComponent(r.run)}">Open every conversation →</a></article>`;
    el.innerHTML = `<div class="section-head"><div><p class="eyebrow">CURRENT QUESTION</p><h2>${esc(runs.map(r => modelName(r.model)).join(' or '))}?</h2><p class="quiet">${esc(pair.note)} Code ${esc(pair.commit)} · judge ${esc(modelName(runs[0].judge?.model))} ${esc(runs[0].judge?.effort ?? '')}.</p></div>
      ${pairs.length > 1 ? `<div class="h2h-tabs" role="tablist">${pairs.map((p, j) => `<button role="tab" aria-selected="${j === i}" data-pair="${j}">${esc(p.date)} · ${esc(p.title)}</button>`).join('')}</div>` : ''}</div>
      <div class="h2h-cards">${runs.map(card).join('')}</div>
      ${pair.finding ? `<p class="h2h-decision"><b>What the exact failures were:</b> ${esc(pair.finding)}</p>` : ''}
      ${pair.decision ? `<p class="h2h-decision"><b>Decision:</b> ${esc(pair.decision)}</p>` : ''}
      <h3 class="h2h-sub">Where they differ <span class="quiet">${pair.disagreements.length} of ${runs[0].cases} cases</span></h3>
      ${pair.disagreements.length ? `<div class="table-scroll"><table class="h2h-table"><thead><tr><th>Case</th>${runs.map(r => `<th>${esc(modelName(r.model))}</th>`).join('')}</tr></thead><tbody>${pair.disagreements.map(d => `<tr><td><b>${esc(d.id)}</b> ${esc(d.name)}</td>${runs.map(r => `<td><a class="outcome ${d.outcomes[r.run]}" href="/evals?run=${encodeURIComponent(r.run)}&case=${encodeURIComponent(d.id)}">${esc(OUTCOME[d.outcomes[r.run]])}</a></td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="quiet">Both models got the same outcome on every case.</p>'}
      <p class="quiet mini">One attempt per case, so a difference of one or two cases can be chance. Cost counts the candidate model only; the judge is the same for both.</p>`;
    el.querySelectorAll('[data-pair]').forEach(b => b.onclick = () => draw(Number(b.dataset.pair)));
  };
  draw(index);
}
