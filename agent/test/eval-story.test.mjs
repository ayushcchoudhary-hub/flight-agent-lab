import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { checkStory, delta, disagreements, isRunKey, loadStory, mergeReports, summarizeRun } from '../eval-story.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const published = join(root, 'published-eval-results');
const story = JSON.parse(readFileSync(join(published, 'story.json'), 'utf8'));
const hardeningRuns = readdirSync(published, { withFileTypes: true })
  .filter(x => x.isDirectory() && x.name.startsWith('live-hardening-judge-') && existsSync(join(published, x.name, 'report.json'))).map(x => x.name);

const row = (caseId, pass, deterministicPass = pass) => ({ caseId, pass, deterministicPass, steps: [{}], events: [] });
const run = (id, rows, names = {}) => summarizeRun(id, { results: rows, models: ['m'] }, rows.map(r => ({ id: r.caseId, name: names[r.caseId] ?? r.caseId })));

test('every published hardening run has exactly one place in the story', () => {
  assert.deepEqual(checkStory(story, hardeningRuns), []);
});

test('a run published without a place in the story is reported', () => {
  const problems = checkStory(story, [...hardeningRuns, 'live-hardening-judge-2099-01-01T00-00-00.000Z']);
  assert.match(problems.join('\n'), /2099.*no place in story\.json/);
});

test('a run listed twice is reported', () => {
  const twice = { ...story, supporting: { ...story.supporting, [story.milestones[0].run]: 'again' } };
  assert.match(checkStory(twice, hardeningRuns).join('\n'), /listed as a milestone and supporting/);
});

test('delta separates fixes, new judge flags, new exact failures and new cases', () => {
  const before = run('a', [row('A', false), row('B', true), row('C', true), row('D', false, true), row('R', true)]);
  const after = run('b', [row('A', true), row('B', false, true), row('C', false), row('D', false, true), row('N', false)]);
  const d = delta(before, after);
  assert.deepEqual(d.fixed.map(x => x.id), ['A']);
  assert.deepEqual(d.newJudgeFlags.map(x => x.id), ['B']);
  assert.deepEqual(d.newExactFailures.map(x => x.id), ['C']);
  assert.deepEqual(d.added.map(x => [x.id, x.outcome]), [['N', 'exact']]);
  assert.deepEqual(d.removed.map(x => x.id), ['R']);
});

test('an exact failure that now only has a judge flag is reported as now correct', () => {
  const d = delta(run('a', [row('A', false)]), run('b', [row('A', false, true)]));
  assert.deepEqual(d.nowCorrect.map(x => x.id), ['A']);
  assert.deepEqual([d.fixed, d.newJudgeFlags, d.newExactFailures].map(x => x.length), [0, 0, 0]);
});

test('a judge flag that becomes an exact failure counts as a new exact failure', () => {
  const d = delta(run('a', [row('A', false, true)]), run('b', [row('A', false)]));
  assert.deepEqual(d.newExactFailures.map(x => x.id), ['A']);
});

test('disagreements list only cases where outcomes differ', () => {
  const a = run('a', [row('A', true), row('B', true), row('C', false, true)]);
  const b = run('b', [row('A', true), row('B', false, true), row('C', false)]);
  assert.deepEqual(disagreements([a, b]).map(x => [x.id, x.outcomes.a, x.outcomes.b]), [['B', 'pass', 'judge'], ['C', 'judge', 'exact']]);
});

test('merging a run finished in two parts keeps case order and each case once', () => {
  const cases = ['A', 'B', 'C'].map(id => ({ id, name: id }));
  const merged = mergeReports([
    { report: { runId: 'p1', label: 'Run', results: [row('A', true), row('B', true)], status: 'stopped', actualCostUsd: 1 }, cases },
    { report: { runId: 'p2', label: 'Run part 2', results: [row('C', false)], status: 'complete', actualCostUsd: 2 }, cases: cases.slice(2) },
  ]);
  assert.deepEqual(merged.report.results.map(r => r.caseId), ['A', 'B', 'C']);
  assert.equal(merged.cases.length, 3);
  assert.equal(merged.report.runId, 'p1+p2');
  assert.equal(merged.report.status, 'complete');
  assert.equal(merged.report.actualCostUsd, 3);
});

test('report keys accept run ids and joined parts, nothing else', () => {
  assert.ok(isRunKey('live-hardening-judge-2026-09-23T10-08-32.825Z'));
  assert.ok(isRunKey('live-a+live-b'));
  for (const bad of ['', 'live-a/../x', '../live-a', 'compare-x', 'live-a+', 'live-a+../b', null]) assert.equal(isRunKey(bad), false, String(bad));
});

test('milestone numbers come from the reports, not from the story file', async () => {
  const loaded = await loadStory(root);
  const baseline = loaded.milestones[0];
  assert.equal(baseline.run, 'live-hardening-judge-2026-09-20T15-56-09.018Z');
  assert.deepEqual([baseline.passed, baseline.exact, baseline.cases], [17, 19, 30]);
  assert.equal(baseline.delta, null);
  const next = loaded.milestones[1];
  assert.deepEqual(next.delta.fixed.map(x => x.id), ['A1', 'A2', 'A3', 'A6', 'E3', 'E5', 'E6']);
  for (const m of story.milestones) for (const key of ['passed', 'exact', 'cases']) assert.equal(key in m, false, `story.json must not type ${key}`);
});
