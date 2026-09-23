// The Evals page's reading order. story.json names the milestones and says in
// plain words what changed and why. Every number shown beside those words is
// computed here from the saved reports, so the prose cannot drift from the
// evidence. Runs that are not milestones stay listed as supporting evidence
// with a one-line reason: the history is append-only.
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { unsupportedArguments } from './model.mjs';

const RUN = /^live-hardening-judge-[\w.-]+$/;
// A run interrupted by a provider error and finished with the remaining cases
// is one run in two parts. The story lists it as an array; the page and the
// report API join the parts with '+'.
export const partsOf = entry => Array.isArray(entry) ? entry : String(entry).split('+');
export const runKey = entry => partsOf(entry).join('+');
export const isRunKey = value => typeof value === 'string' && value.length < 400 && value.split('+').every(part => /^live-[\w.-]+$/.test(part));
const median = xs => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2 : null; };
const outcome = row => row.pass ? 'pass' : row.deterministicPass ? 'judge' : 'exact';

// Values the model put in a tool call that the traveler never said. A guard
// that catches one keeps the reply right, so the case can still pass, but the
// model made it up, and that is worth seeing when choosing a model. Two
// sources: the guard's own trace, and, for runs recorded before a guard
// existed, the recorded tool calls checked against everything the traveler
// typed in that case (a generous check, so it undercounts rather than
// overcounts). Dates are left out: a follow-up often resends the trip's dates
// in another form ("next week" as a mode), which the date guard drops but
// which is not an invention.
const MADE_UP = /did not mention|recovered a place/;
export function madeUpValues(row) {
  const fields = [];
  for (const e of row.events) if (e.type === 'tool_argument_repair' && MADE_UP.test(e.data?.reason ?? '')) fields.push(...(e.data.fields ?? [e.data.field]).filter(Boolean));
  const said = row.steps.map(step => step.input ?? '').join('\n');
  for (const e of row.events) {
    if (e.type !== 'tool_call') continue;
    const { invented, places } = unsupportedArguments(said, e.data?.name, e.data?.arguments);
    fields.push(...invented, ...Object.keys(places));
  }
  return fields.filter(field => field !== 'dates');
}

// The container copies published-eval-results to eval-results. Locally the
// raw eval-results folder holds unpublished runs too, so read the story from
// whichever folder has it, and reports from the same folder.
export function storyRoot(root) {
  for (const dir of ['eval-results', 'published-eval-results']) if (existsSync(join(root, dir, 'story.json'))) return join(root, dir);
  return null;
}

// What one run says, reduced to what the story needs.
export function summarizeRun(run, report, cases) {
  const rows = report.results;
  const usage = rows.flatMap(row => row.events.filter(e => e.type === 'model_usage').map(e => e.data));
  const judgeUsage = rows.flatMap(row => row.events.filter(e => e.type === 'judge_usage').map(e => e.data));
  const turns = rows.reduce((n, row) => n + row.steps.length, 0);
  const cost = xs => xs.reduce((n, x) => n + (Number.isFinite(x.usage?.cost) ? x.usage.cost : 0), 0);
  const candidateCostUsd = cost(usage);
  return {
    run, label: report.label ?? null, model: report.models?.[0] ?? null, effort: report.effort ?? null,
    promptVersion: report.promptVersion ?? null, judge: report.judge ? { model: report.judge.model, effort: report.judge.effort } : null,
    cases: cases.length, completed: rows.length,
    passed: rows.filter(r => r.pass).length,
    exact: rows.filter(r => r.deterministicPass).length,
    judgeOnly: rows.filter(r => !r.pass && r.deterministicPass).length,
    exactFailed: rows.filter(r => !r.deterministicPass).length,
    medianCallMs: median(usage.map(u => u.latencyMs).filter(Number.isFinite)),
    candidateCostUsd, judgeCostUsd: cost(judgeUsage), turns,
    costPer1000TurnsUsd: turns ? candidateCostUsd / turns * 1000 : null,
    madeUp: rows.map(r => ({ id: r.caseId, fields: madeUpValues(r) })).filter(x => x.fields.length),
    outcomes: Object.fromEntries(rows.map(r => [r.caseId, outcome(r)])),
    names: Object.fromEntries(cases.map(c => [c.id, c.name])),
  };
}

// Case by case, what moved between two runs. A case that newly fails only the
// judge is kept apart from one that newly fails an exact check, because the
// first is wording (and sometimes a stricter judge) and the second is behavior.
export function delta(before, after) {
  const item = id => ({ id, name: after.names[id] ?? before.names[id] ?? id });
  const out = { fixed: [], nowCorrect: [], newJudgeFlags: [], newExactFailures: [], added: [], removed: [] };
  for (const [id, now] of Object.entries(after.outcomes)) {
    const was = before.outcomes[id];
    if (!was) { out.added.push({ ...item(id), outcome: now }); continue; }
    if (was !== 'pass' && now === 'pass') out.fixed.push(item(id));
    else if (was === 'exact' && now === 'judge') out.nowCorrect.push(item(id));
    else if (was !== 'exact' && now === 'exact') out.newExactFailures.push(item(id));
    else if (was === 'pass' && now === 'judge') out.newJudgeFlags.push(item(id));
  }
  for (const id of Object.keys(before.outcomes)) if (!(id in after.outcomes)) out.removed.push(item(id));
  return out;
}

// Cases where head-to-head runs disagree, with each model's outcome.
export function disagreements(runs) {
  const ids = [...new Set(runs.flatMap(r => Object.keys(r.outcomes)))];
  return ids.filter(id => new Set(runs.map(r => r.outcomes[id] ?? 'missing')).size > 1)
    .map(id => ({ id, name: runs.find(r => r.names[id])?.names[id] ?? id, outcomes: Object.fromEntries(runs.map(r => [r.run, r.outcomes[id] ?? 'missing'])) }));
}

// Every hardening run in dir is placed exactly once. Returns the problems, so
// a test can fail when a new run is published without a place in the story.
export function checkStory(story, runsOnDisk) {
  const problems = [], seen = new Map();
  const place = (run, where) => { if (seen.has(run)) problems.push(`${run} is listed as ${seen.get(run)} and ${where}.`); else seen.set(run, where); };
  const milestoneParts = story.milestones.flatMap(m => partsOf(m.run));
  story.milestones.forEach(m => partsOf(m.run).forEach(run => place(run, 'a milestone')));
  for (const pair of story.headToHead) for (const entry of pair.runs) for (const run of partsOf(entry)) if (!milestoneParts.includes(run)) place(run, 'a head-to-head run');
  for (const run of Object.keys(story.supporting)) place(run, 'supporting');
  for (const run of seen.keys()) if (!runsOnDisk.includes(run)) problems.push(`${run} is in the story but not published.`);
  for (const run of runsOnDisk) if (!seen.has(run)) problems.push(`${run} is published but has no place in story.json.`);
  for (const m of story.milestones) for (const key of ['date', 'title', 'why']) if (typeof m[key] !== 'string' || !m[key]) problems.push(`${m.run} needs ${key}.`);
  return problems;
}

// Join the parts of one run: the first part's settings, every part's results
// in case order, and each case once.
export function mergeReports(parts) {
  if (parts.length === 1) return parts[0];
  const cases = [], seen = new Set();
  for (const part of parts) for (const c of part.cases) if (!seen.has(c.id)) { seen.add(c.id); cases.push(c); }
  const order = new Map(cases.map((c, i) => [c.id, i]));
  const first = parts[0].report;
  const results = parts.flatMap(part => part.report.results).sort((a, b) => order.get(a.caseId) - order.get(b.caseId));
  const sum = key => parts.reduce((n, part) => n + (Number(part.report[key]) || 0), 0);
  return {
    report: { ...first, runId: parts.map(part => part.report.runId).join('+'), label: `${first.label} · ${parts.length} parts`, results,
      status: parts.at(-1).report.status, stopReason: parts.at(-1).report.stopReason ?? null, modelCallsAttempted: sum('modelCallsAttempted'), actualCostUsd: sum('actualCostUsd'),
      parts: parts.map(part => ({ runId: part.report.runId, label: part.report.label, completed: part.report.results.length, status: part.report.status, stopReason: part.report.stopReason ?? null })) },
    cases,
  };
}

export async function readReport(dir, key) {
  return mergeReports(await Promise.all(partsOf(key).map(async run => {
    const [report, cases] = await Promise.all(['report.json', 'cases.json'].map(async f => JSON.parse(await readFile(join(dir, run, f), 'utf8'))));
    return { report, cases };
  })));
}

async function readRun(dir, key) {
  const { report, cases } = await readReport(dir, key);
  return summarizeRun(runKey(key), report, cases);
}

export async function loadStory(root) {
  const dir = storyRoot(root);
  if (!dir) return null;
  const story = JSON.parse(await readFile(join(dir, 'story.json'), 'utf8'));
  const onDisk = (await readdir(dir, { withFileTypes: true })).filter(x => x.isDirectory() && RUN.test(x.name) && existsSync(join(dir, x.name, 'report.json'))).map(x => x.name);
  const milestones = [];
  const published = entry => partsOf(entry).every(run => onDisk.includes(run));
  const cache = new Map(), get = entry => { const key = runKey(entry); if (!cache.has(key)) cache.set(key, readRun(dir, key)); return cache.get(key); };
  let previous = null;
  for (const m of story.milestones) {
    if (!published(m.run)) continue;
    const summary = await get(m.run);
    const { outcomes, names, ...numbers } = summary;
    milestones.push({ ...m, ...numbers, outcomes, parts: partsOf(m.run).length, delta: previous ? delta(previous, summary) : null });
    previous = summary;
  }
  const headToHead = [];
  for (const pair of story.headToHead) {
    if (!pair.runs.every(published)) continue;
    const runs = await Promise.all(pair.runs.map(get));
    headToHead.push({ ...pair, runs: runs.map(({ outcomes, names, ...rest }) => rest), disagreements: disagreements(runs) });
  }
  return { about: story.about, before: story.before, milestones, headToHead, supporting: story.supporting };
}
