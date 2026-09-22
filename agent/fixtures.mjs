import { createApiClient, shiftIso, flightSearchStatusQueryOptions } from './shared.mjs';
import { validateDiscoverResponse } from './discover.mjs';

// Deliberately synthetic records. Never calls an airline, payment processor or
// external environment. Records carry only the fields the agent validates and
// renders (see validateSearchResponse in shared.mjs) plus the status fields the
// adapter polls. The live API may return more; the agent ignores extra fields.
export function makeFixtureAdapter(scenario = 'normal', trace = () => {}) {
  const snapshots = new Map();
  const calls = [];
  const allowedScenarios = ['normal', 'empty', 'unavailable', 'nearby', 'cabin-fallback', 'comparison-unavailable', 'malformed', 'deals-past', 'deals-unavailable', 'deals-malformed'];
  if (!allowedScenarios.includes(scenario)) throw new Error('Unknown fixture scenario');
  const api = createApiClient('https://local-fixtures.invalid/v1', {
    async onRequest({ request }) {
      const path = new URL(request.url).pathname;
      const body = request.method === 'POST' ? await request.clone().json() : undefined;
      const event = { method: request.method, path, ...(body ? { body } : {}) };
      calls.push(event);
      trace('flight_api', { ...event, mode: 'synthetic' });
      if (request.method === 'POST' && path === '/v1/flight-searches') {
        if (scenario === 'unavailable') return Response.json({ detail: 'Synthetic inventory outage' }, { status: 503 });
        const id = `fixture-search-${snapshots.size + 1}`;
        const results = scenario === 'empty' ? [] : fixtureResults(body, scenario);
        const response = {
          searchId: id, summary: 'Synthetic learning fixtures — not live availability',
          totalFound: results.length, results, query: body,
          providerStatuses: [{ id: 'fixture', label: 'Synthetic inventory', role: 'inventory', status: 'complete', resultCount: results.length }],
          comparisonStatus: 'unavailable', comparisonRetrySupported: false,
          ...(scenario === 'cabin-fallback' && body.cabin !== 'economy' && body.cabin !== 'any' ? {
            cabinFallbackInfo: { reason: 'cabinUnavailable', requestedCabin: body.cabin, foundCabin: 'economy', message: 'Synthetic cabin fallback' },
          } : {}),
        };
        if (scenario === 'malformed') response.results[0].pricing.customerAmountUsd = 'not-a-price';
        snapshots.set(id, response);
        return Response.json(response);
      }
      if (request.method === 'GET' && path.startsWith('/v1/flight-searches/')) {
        const snapshot = snapshots.get(decodeURIComponent(path.split('/').at(-1)));
        return snapshot ? Response.json(snapshot) : Response.json({ detail: 'Unknown search' }, { status: 404 });
      }
      // Return a response for EVERY path so the fake host can never be fetched.
      return Response.json({ detail: 'Operation is outside the search-only scope' }, { status: 403 });
    },
  });
  return {
    mode: 'synthetic', calls,
    // Synthetic deals, dated relative to the conversation clock so held-out
    // cases stay valid on any day. Same validation as the live feed.
    async discover({ metro, limit, today }) {
      calls.push({ method: 'GET', path: '/v1/discover/flights', metro, limit });
      trace('discover_api', { metro, limit, mode: 'synthetic' });
      if (scenario === 'deals-unavailable') return { unavailable: true };
      const doc = fixtureDeals(metro, today, scenario);
      if (!doc) return { unknownMetro: true };
      doc.tiles = doc.tiles.slice(0, limit);
      return { feed: validateDiscoverResponse(doc) };
    },
    async search(body) {
      const { data, error, response } = await api.POST('/flight-searches', { body });
      if (error || !data) throw new Error(`Flight search unavailable (HTTP ${response.status}). This is not a no-results response.`);
      // Same read path as the live adapter, so fixtures exercise the agent-owned
      // response validation in shared.mjs.
      return flightSearchStatusQueryOptions(api, data).queryFn();
    },
  };
}

function fixtureResults(body, scenario) {
  const origins = body.origin.split('|');
  const destinations = body.destination.split('|');
  const results = [];
  let date = body.dateFrom;
  for (let day = 0; date <= body.dateTo && day < 32; day++, date = shiftIso(date, 1)) {
    if (scenario === 'nearby' && date === body.selectedDate) continue;
    for (let variant = 0; variant < 3; variant++) {
      const origin = origins[variant % origins.length];
      const destination = destinations[variant % destinations.length];
      if (origin === destination) continue;
      const cabin = scenario === 'cabin-fallback' ? 'economy' : body.cabin === 'any' ? ['business', 'economy', 'premium'][variant] : body.cabin;
      const price = (cabin === 'economy' ? 420 : 1100) + day * 13 + variant * 80;
      results.push({
        availabilityId: `synthetic-${origin}-${destination}-${date}-${variant}`, date, origin, destination,
        cabin, direct: variant !== 1, stops: variant === 1 ? 1 : 0,
        airlines: ['Demo Air'],
        source: { id: 'fixture', label: 'Synthetic inventory' },
        pricing: { currency: 'USD', customerAmountUsd: price },
        retailComparison: { status: 'unavailable', currency: 'USD', source: { id: 'fixture-comparison', label: 'Synthetic comparison' } },
        // Intentionally omit times. The agent must not invent missing fields.
      });
    }
  }
  return results;
}

// Synthetic departure cities and deals. Real city names so resolution is
// exercised, invented prices and savings. Not a copy of the product's list.
const FIXTURE_DEAL_CITIES = {
  London: [['LHR', 'Heathrow']],
  'New York': [['JFK', 'Kennedy']],
  Tokyo: [['HND', 'Haneda']],
  Paris: [['CDG', 'Charles de Gaulle']],
  Dubai: [['DXB', 'Dubai']],
  Singapore: [['SIN', 'Changi']],
  'San Francisco': [['SFO', 'San Francisco']],
};
const FIXTURE_DESTINATIONS = [
  { city: 'Charlotte', country: 'US', airport: 'CLT', region: 'North America', sub_region: 'North America', stops: 1, via: ['New York (JFK)'], price: 1290, retail: 10805 },
  { city: 'Bangkok', country: 'TH', airport: 'BKK', region: 'Asia', sub_region: 'South-East Asia', stops: 0, via: [], price: 1480, retail: 6200 },
  { city: 'Cape Town', country: 'ZA', airport: 'CPT', region: 'Africa', sub_region: 'Southern Africa', stops: 1, via: ['Doha (DOH)'], price: 1620, retail: 5900 },
  { city: 'Lisbon', country: 'PT', airport: 'LIS', region: 'Europe', sub_region: 'Southern Europe', stops: 0, via: [], price: 690, retail: 2100 },
  { city: 'Sydney', country: 'AU', airport: 'SYD', region: 'Oceania', sub_region: 'Australia', stops: 1, via: ['Singapore (SIN)'], price: 2410, retail: 9800 },
  { city: 'Seoul', country: 'KR', airport: 'ICN', region: 'Asia', sub_region: 'East Asia', stops: 0, via: [], price: 1350, retail: 5400, cabin: 'first' },
];
export function fixtureDeals(metro, today, scenario = 'normal') {
  const name = Object.keys(FIXTURE_DEAL_CITIES).find(c => c.toLowerCase() === String(metro).toLowerCase());
  const everywhere = String(metro).toLowerCase() === 'everywhere';
  if (!name && !everywhere) return null;
  const origins = everywhere ? Object.keys(FIXTURE_DEAL_CITIES) : [name];
  const base = today ?? '2026-09-18';
  const past = scenario === 'deals-past';
  const tiles = [];
  origins.forEach((city, o) => FIXTURE_DESTINATIONS.forEach((d, i) => {
    const [origin] = FIXTURE_DEAL_CITIES[city][0];
    if (origin === d.airport || (everywhere && (i + o) % 3)) return;
    const date = shiftIso(base, past ? -(i + 2) : i + 1 + o);
    tiles.push({
      airline: 'Demo Air', airport: d.airport, cabin: d.cabin ?? 'business', city: d.city, country: d.country, date,
      departs_at: `${date}T18:05:00Z`, origin, origin_metro: city, price_usd: d.price + o * 37, retail_usd: d.retail,
      save_usd: d.retail - d.price, save_pct: Math.round(100 * (d.retail - d.price) / d.retail), rank: tiles.length + 1,
      region: d.region, sub_region: d.sub_region, seats: 4, stops: d.stops, via_cities: d.via, last_verified_at: `${base}T02:00:00Z`,
    });
  }));
  if (scenario === 'deals-malformed') tiles[0].price_usd = 'free';
  return { metro: everywhere ? 'Everywhere' : name, multi_origin: everywhere, generated_at: `${shiftIso(base, past ? -8 : 0)}T02:00:00Z`, stale: past, stale_reason: past ? 'age' : null, window_days: 7, tiles };
}
