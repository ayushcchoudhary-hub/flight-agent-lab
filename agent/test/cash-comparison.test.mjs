import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchConversation, usualCashUsd, CASH_FOOTNOTE } from '../search.mjs';
import { makeFixtureAdapter } from '../fixtures.mjs';
import { verifyFlightData } from '../verify-flight-data.mjs';
import { displayPriceUsd } from '../shared.mjs';

// Each award result from the product carries a cash price for the exact same
// flights (retailComparison). Staging on 2026-09-27 priced every London to New
// York result from Google Flights, e.g. USD 1,690.95 against USD 3,276.
const NOW = Date.parse('2026-09-18T12:00:00Z');
const later = new Date(NOW + 10 * 60000).toISOString(), earlier = new Date(NOW - 60000).toISOString();
const priced = (amountUsd, validUntil = later) => ({ status: 'priced', currency: 'USD', amountUsd, validUntil, source: { id: 'google_flights', label: 'Google Flights' } });

// A fixture adapter whose results carry the comparison chosen per result.
function withComparisons(pick) {
  const fixture = makeFixtureAdapter('normal');
  const adapter = { ...fixture, snapshots: [], async search(query) {
    const response = await fixture.search(query);
    const results = response.results.map((r, i) => ({ ...r, retailComparison: pick(r, i) }));
    const out = { ...response, results };
    adapter.snapshots.push({ query: response.query ?? query, results });
    return out;
  } };
  return adapter;
}
const search = async adapter => new SearchConversation({ adapter, today: () => '2026-09-18', now: () => NOW })
  .find({ origin: 'London', destination: 'New York', dates: { mode: 'exact', start: '2026-10-01' } });

test('a priced cash comparison is shown as “usually” beside the price, with one footnote', async () => {
  const r = await search(withComparisons(rec => priced(displayPriceUsd(rec) * 2.5)));
  assert.equal(r.status, 'results');
  for (const offer of r.shortlist) {
    assert.equal(offer.usualUsd, offer.priceUsd * 2.5);
    assert.ok(offer.text.includes(` · usually USD ${Math.round(offer.priceUsd * 2.5).toLocaleString('en-US')}\n`), offer.text);
  }
  assert.equal(r.text.split(CASH_FOOTNOTE).length - 1, 1);
});

test('pending, unavailable, expired or lower comparisons are left out', async () => {
  const cases = [
    { status: 'pending', currency: 'USD', source: { id: 'google_flights', label: 'Google Flights' } },
    { status: 'unavailable', currency: 'USD', source: { id: 'google_flights', label: 'Google Flights' } },
    null,
  ];
  for (const comparison of cases) {
    const r = await search(withComparisons(() => comparison));
    assert.doesNotMatch(r.text, /usually|Google Flights/, JSON.stringify(comparison));
  }
  const record = { arbPriceUsd: 1000 };
  assert.equal(usualCashUsd({ ...record, retailComparison: priced(3000, earlier) }, NOW), null, 'expired');
  assert.equal(usualCashUsd({ ...record, retailComparison: priced(900) }, NOW), null, 'cheaper than our price');
  assert.equal(usualCashUsd({ ...record, retailComparison: priced(3000) }, NOW), 3000);
  assert.equal(usualCashUsd({ ...record, retailComparison: { ...priced(3000), currency: 'EUR' } }, NOW), null, 'not USD');
});

test('the footnote appears only when at least one shown result has a comparison', async () => {
  const r = await search(withComparisons((rec, i) => i === 0 ? priced(displayPriceUsd(rec) + 500) : null));
  const shown = r.shortlist.filter(x => x.usualUsd).length;
  assert.equal(r.text.includes(CASH_FOOTNOTE), shown > 0);
});

test('data verification checks the displayed cash comparison against the API', async () => {
  const adapter = withComparisons(rec => priced(displayPriceUsd(rec) * 3));
  const r = await search(adapter);
  const snapshot = adapter.snapshots.at(-1);
  const good = verifyFlightData(r, snapshot, snapshot.query);
  assert.ok(good.checks.filter(c => /cash comparison/.test(c.name)).every(c => c.pass));
  // A displayed amount the API never sent fails verification.
  const tampered = { ...r, shortlist: r.shortlist.map((o, i) => i ? o : { ...o, usualUsd: o.usualUsd + 100, text: o.text.replace(/usually USD [\d,]+/, 'usually USD 99,999') }) };
  tampered.text = r.text.replace(r.shortlist[0].text, tampered.shortlist[0].text);
  assert.ok(verifyFlightData(tampered, snapshot, snapshot.query).checks.some(c => /cash comparison/.test(c.name) && !c.pass));
});
