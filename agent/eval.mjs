import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SearchConversation } from './search.mjs';
import { makeFixtureAdapter } from './fixtures.mjs';

// Fixed expected outcomes evaluate tool/application behavior, NOT a language
// model's ability to infer the right calls. Paid model evaluation is separate.
const cases = [
  { id: 'D01', name: 'Destination-only defaults', inputs: [{ destination: 'New York' }, { choice: 1 }], check: (r, c) => r.query.cabin === 'business' && r.query.dateFrom === '2026-09-18' && c.state.origin.code.includes('LHR') },
  { id: 'D02', name: 'Airport/cabin refinement preserves dates', inputs: [{ origin: 'London', destination: 'New York', dates: { mode: 'nextWeek' } }, { origin: 'Heathrow', cabin: 'economy' }], check: r => r.query.origin === 'LHR' && r.query.cabin === 'economy' && r.query.dateFrom === '2026-09-21' },
  { id: 'D03', name: 'Nearby-date fallback labelled', scenario: 'nearby', inputs: [{ origin: 'London', destination: 'New York', dates: { mode: 'exact', start: '2026-10-01' } }], check: r => r.shortlist.length > 0 && r.shortlist.every(f => f.reasons.includes('nearby date')) },
  { id: 'D04', name: 'Cabin-only restriction', scenario: 'cabin-fallback', inputs: [{ origin: 'London', destination: 'New York', cabinOnly: true }], check: r => r.shortlist.length === 0 },
  { id: 'D05', name: 'No flights is not an outage', scenario: 'empty', inputs: [{ origin: 'London', destination: 'New York' }], check: r => r.status === 'results' && r.shortlist.length === 0 },
  { id: 'D06', name: 'Provider outage is not empty inventory', scenario: 'unavailable', inputs: [{ origin: 'London', destination: 'New York' }], check: r => r.status === 'error' && r.text.includes('unavailable') },
  { id: 'H01', name: 'Exact airport survives cabin change', inputs: [{ origin: 'SIN', destination: 'LHR', maxPriceUsd: 1400 }, { cabin: 'economy' }], check: (r,c) => r.query.origin === 'SIN' && r.query.destination === 'LHR' && c.state.maxPriceUsd === 1400 },
  { id: 'H02', name: 'Invalid date blocked', inputs: [{ origin: 'Dubai', destination: 'London', dates: { mode: 'exact', start: '2026-02-30' } }], check: (r,c,a) => r.status === 'error' && a.calls.length === 0 },
];
const report = { mode: 'deterministic-application-evals-NO-LLM', clock: '2026-09-18', results: [] };
for (const item of cases) {
  const trace = [];
  const adapter = makeFixtureAdapter(item.scenario ?? 'normal', (type, data) => trace.push({ type, data }));
  const c = new SearchConversation({ adapter, today: () => report.clock });
  let result;
  for (const input of item.inputs) result = 'choice' in input ? await c.choose(input.choice) : await c.find(input);
  let pass = false;
  try { pass = Boolean(item.check(result, c, adapter)); } catch { /* recorded as fail */ }
  report.results.push({ id: item.id, name: item.name, pass, inputs: item.inputs, result, trace });
}
report.passed = report.results.filter(r => r.pass).length;
const base = fileURLToPath(new URL('./eval-results/', import.meta.url));
mkdirSync(base, { recursive: true });
writeFileSync(base + 'application-evals.json', JSON.stringify(report, null, 2));
writeFileSync(base + 'application-evals.md', '# Application eval results\n\n**Synthetic tools; no model calls. These are not LLM evaluation results.**\n\n' + report.results.map(r => `- ${r.pass ? 'PASS' : 'FAIL'} ${r.id}: ${r.name}`).join('\n') + '\n');
console.log(`${report.passed}/${cases.length} application evals passed (no LLM, no API charges).`);
if (report.passed !== cases.length) process.exitCode = 1;
