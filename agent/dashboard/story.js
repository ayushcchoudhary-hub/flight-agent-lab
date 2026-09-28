// The reading order for the evals pages. Data comes from /api/story, which
// computes every number from the saved reports. This file only draws it.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MODEL_NAMES = { 'openai/gpt-5.6-terra': 'Terra', 'openai/gpt-6-sol': 'Sol', 'anthropic/claude-sonnet-4.6': 'Sonnet 4.6', 'anthropic/claude-opus-5': 'Opus 5', 'anthropic/claude-opus-5.5': 'Opus 5.5', 'anthropic/claude-sonnet-5': 'Sonnet 5', 'anthropic/claude-sonnet-5.5': 'Sonnet 5.5' };
export const modelName = m => MODEL_NAMES[m] ?? String(m ?? '').split('/').pop();
const FIELD_NAMES = { region: 'region', maxPriceUsd: 'budget', aside: 'stray note', cabin: 'cabin', origin: 'garbled origin', destination: 'garbled destination' };
const OUTCOME = { pass: 'Passed', judge: 'Judge flagged wording', exact: 'Failed an exact check', missing: 'Not run' };
// The pages' CSP allows no inline style attributes, so bar sizes travel as
// data attributes and are applied here through the CSSOM, which it allows.
const applySizes = root => root.querySelectorAll('[data-height],[data-width]').forEach(node => {
  if (node.dataset.height) node.style.height = node.dataset.height;
  if (node.dataset.width) node.style.width = node.dataset.width;
});
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
      <span class="seg exact" data-height="${h(m.exactFailed)}"></span>
      <span class="seg judge" data-height="${h(m.judgeOnly)}"></span>
      <span class="seg pass" data-height="${h(m.passed)}"></span>
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
    applySizes(el);
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
    const madeUpCount = r => r.madeUp.reduce((n, x) => n + x.fields.length, 0), fewestMadeUp = Math.min(...runs.map(madeUpCount));
    const card = r => `<article class="h2h-card"><h3>${esc(modelName(r.model))} <span class="quiet">${esc(r.effort ?? '')}</span></h3>
      <div class="h2h-metric"><small>Cases passed</small><b class="${r.passed === best('passed') ? 'lead' : ''}">${r.passed}<span class="quiet">/${r.cases}</span></b><span class="h2h-bar"><span class="pass" data-width="${r.passed / r.cases * 100}%"></span><span class="judge" data-width="${r.judgeOnly / r.cases * 100}%"></span><span class="exact" data-width="${r.exactFailed / r.cases * 100}%"></span></span></div>
      <div class="h2h-metric"><small>Exact checks passed</small><b class="${r.exact === best('exact') ? 'lead' : ''}">${r.exact}<span class="quiet">/${r.cases}</span></b></div>
      <div class="h2h-metric"><small>Made-up values <span class="quiet">(caught by the app)</span></small><b class="${madeUpCount(r) === fewestMadeUp ? 'lead' : ''}">${madeUpCount(r) ? `${madeUpCount(r)}<span class="quiet"> in ${r.madeUp.length} case${r.madeUp.length === 1 ? '' : 's'}</span>` : 'None'}</b>${r.madeUp.length ? `<span class="h2h-madeup">${r.madeUp.map(x => `<a href="/evals?run=${encodeURIComponent(r.run)}&case=${encodeURIComponent(x.id)}" title="${esc(x.fields.join(', '))}">${esc(x.id)}: ${esc([...new Set(x.fields)].map(f => FIELD_NAMES[f] ?? f).join(', '))}</a>`).join('')}</span>` : ''}</div>
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
      <p class="quiet mini">One attempt per case, so a difference of one or two cases can be chance. Cost counts the candidate model only; the judge is the same for both. Made-up values are things the model put in a search that the traveler never said, such as a region, a budget or a mangled city name. The app catches these and drops or repairs them, so a case can still pass, but they show how much the model invents. Resent dates are not counted.</p>`;
    applySizes(el);
    el.querySelectorAll('[data-pair]').forEach(b => b.onclick = () => draw(Number(b.dataset.pair)));
  };
  draw(index);
}

// ---- Trend over time: one point per complete run of the held-out set.
// Three hues are all the palette keeps apart when every pair can sit side by
// side (checked in light and dark), so color marks the model family and the
// marker marks the model within it: an older Claude model is a hollow ring.
const FAMILY = m => m?.startsWith('anthropic/') ? 'claude' : m === 'openai/gpt-5.6-terra' ? 'terra' : m === 'openai/gpt-6-sol' ? 'sol' : 'other';
const HOLLOW = new Set(['anthropic/claude-sonnet-5']);
const pct = n => Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—';
const TREND_PANELS = [
  { key: r => r.passed / r.cases, title: 'Cases passed', fmt: pct, max: 1, better: 'higher' },
  { key: r => r.exact / r.cases, title: 'Exact checks passed', fmt: pct, max: 1, better: 'higher' },
  { key: r => r.medianTurnMs, title: 'Median time per traveler turn', fmt: secs, better: 'lower' },
  { key: r => r.costPer1000TurnsUsd, title: 'Model cost per 1,000 traveler turns', fmt: money, better: 'lower' },
  { key: r => r.cacheReadShare, title: 'Prompt read from cache', fmt: pct, max: 1, better: 'higher' },
];
// The axis top rounds up to 1, 2, 4, 5 or 8 times a power of ten, so the
// half-way gridline is a round number too.
const niceCeil = v => { if (!(v > 0)) return 1; const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 4, 5, 8, 10].find(s => s * p >= v) * p; };
const day = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function trendPanel(panel, runs, p) {
  const W = 340, H = 150, L = 44, R = 12, T = 12, B = 26;
  const values = runs.map(panel.key);
  const top = panel.max ?? niceCeil(Math.max(...values.filter(Number.isFinite)) * 1.1);
  const x = i => L + (runs.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (runs.length - 1));
  const y = v => T + (1 - v / top) * (H - T - B);
  const grid = [0, 0.5, 1].map(f => `<line class="trend-rule" x1="${L}" x2="${W - R}" y1="${y(top * f)}" y2="${y(top * f)}"/><text class="trend-axis" x="${L - 6}" y="${y(top * f) + 4}" text-anchor="end">${esc(panel.fmt(top * f))}</text>`).join('');
  // A date under the first run of each day only, so labels never collide.
  const ticks = runs.map((r, i) => i === 0 || day(r.date) !== day(runs[i - 1].date) ? `<text class="trend-axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(day(r.date))}</text>` : '').join('');
  const lines = [...new Set(runs.map(r => FAMILY(r.model)))].map(f => {
    const pts = runs.map((r, i) => i).filter(i => FAMILY(runs[i].model) === f && Number.isFinite(values[i])).map(i => `${x(i)},${y(values[i])}`);
    return pts.length > 1 ? `<polyline class="trend-line ${f}" points="${pts.join(' ')}"/>` : '';
  }).join('');
  const dots = runs.map((r, i) => Number.isFinite(values[i]) ? `<g class="trend-point" tabindex="0" data-panel="${p}" data-index="${i}" role="img" aria-label="${esc(`${day(r.date)}, ${modelName(r.model)}: ${panel.fmt(values[i])}`)}"><circle class="trend-hit" cx="${x(i)}" cy="${y(values[i])}" r="12"/><circle class="trend-dot ${FAMILY(r.model)}${HOLLOW.has(r.model) ? ' hollow' : ''}" cx="${x(i)}" cy="${y(values[i])}" r="5"/></g>` : '').join('');
  const last = runs.length - 1, first = values.findIndex(Number.isFinite);
  const since = first >= 0 && first < last ? ` · ${panel.fmt(values[first])} on ${day(runs[first].date)}` : '';
  return `<figure class="trend-panel"><figcaption><span>${esc(panel.title)}</span><b>${esc(panel.fmt(values[last]))}</b><small class="quiet">latest, ${esc(modelName(runs[last].model))}${esc(since)} · ${panel.better} is better</small></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(panel.title)} for each run">${grid}${ticks}${lines}${dots}</svg></figure>`;
}

// Draw the trend panels, a legend and a table of the same numbers.
export function renderTrend(el, story) {
  const runs = story.trend ?? [];
  if (runs.length < 2) { el.hidden = true; return; }
  el.hidden = false;
  const legend = [...new Set(runs.map(r => r.model))].map(m => `<span><i class="trend-key ${FAMILY(m)}${HOLLOW.has(m) ? ' hollow' : ''}"></i>${esc(modelName(m))}</span>`).join('');
  const cell = n => Number.isFinite(n) ? `$${n.toFixed(4)}` : '—';
  const rows = runs.map(r => `<tr><td>${esc(day(r.date))}</td><td>${esc(modelName(r.model))} ${esc(r.effort ?? '')}</td><td>${r.passed}/${r.cases}</td><td>${r.exact}/${r.cases}</td><td>${secs(r.medianTurnMs)}</td><td>${secs(r.medianCallMs)}</td><td>${money(r.costPer1000TurnsUsd)}</td><td>${cell(r.costPerPassedCaseUsd)}</td><td>${pct(r.cacheReadShare)}</td><td>${r.madeUpValues}</td><td>${esc(r.promptVersion ?? '')}</td></tr>`).join('');
  el.innerHTML = `<div class="section-head"><div><h2>Trend over time</h2><p class="quiet">Every complete run of the held-out set, in the order it ran. The set grew from 30 to 52 cases, so passes are a share. Lines join runs of the same model family.</p></div><div class="story-legend">${legend}</div></div>
    <div class="trend-panels">${TREND_PANELS.map((panel, p) => trendPanel(panel, runs, p)).join('')}</div>
    <div class="trend-tip" role="status" hidden></div>
    <details class="method"><summary>Show as a table</summary><div class="table-scroll"><table><thead><tr><th>Date</th><th>Model</th><th>Passed</th><th>Exact</th><th>Median turn</th><th>Median model call</th><th>Cost per 1,000 turns</th><th>Cost per passed case</th><th>From cache</th><th>Made-up values</th><th>Prompt</th></tr></thead><tbody>${rows}</tbody></table></div></details>
    <p class="quiet mini">Time per turn runs from the traveler's message to the reply. Flights are simulated, so it is mostly model time. Cost counts the candidate model only, not the judge. Claude requests are marked for prompt caching from 27 Sept, so Claude runs before then read nothing from cache and cost more per turn. The judge changed twice, so exact checks are the steadier trend. One attempt per case, so a point or two either way can be chance.</p>`;
  const tip = el.querySelector('.trend-tip');
  const show = g => {
    const r = runs[Number(g.dataset.index)], panel = TREND_PANELS[Number(g.dataset.panel)];
    const v = document.createElement('b'); v.textContent = panel.fmt(panel.key(r));
    const who = document.createElement('span'); who.textContent = `${modelName(r.model)} · ${day(r.date)} · ${r.passed}/${r.cases} passed`;
    const what = document.createElement('small'); what.textContent = r.title ?? r.label ?? '';
    tip.replaceChildren(v, who, what);
    tip.hidden = false;
    const dot = g.querySelector('.trend-dot').getBoundingClientRect(), box = el.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(dot.left - box.left + 14, box.width - tip.offsetWidth - 8))}px`;
    tip.style.top = `${dot.top - box.top - tip.offsetHeight - 6}px`;
  };
  el.querySelectorAll('.trend-point').forEach(g => { g.onpointerenter = g.onfocus = () => show(g); g.onpointerleave = g.onblur = () => { tip.hidden = true; }; });
}
