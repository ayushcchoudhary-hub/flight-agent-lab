import { createApiClient, shiftIso, flightSearchStatusQueryOptions } from './shared.mjs';

// Deliberately synthetic records. Never calls an airline, payment processor or
// CommonSwyft environment. Shapes are checked by the app's own response parser.
export function makeFixtureAdapter(scenario = 'normal', trace = () => {}) {
  const snapshots = new Map();
  const calls = [];
  const allowedScenarios = ['normal', 'empty', 'unavailable', 'nearby', 'cabin-fallback', 'comparison-unavailable', 'malformed'];
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
    async search(body) {
      const { data, error, response } = await api.POST('/flight-searches', { body });
      if (error || !data) throw new Error(`Flight search unavailable (HTTP ${response.status}). This is not a no-results response.`);
      // The existing GET query validates SearchResponse internally. Importing it
      // avoids duplicating the private response validator or changing the repo.
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
        program: 'fixture', programName: 'Synthetic award program', cabin, miles: 50000,
        taxesUsd: 80, arbPriceUsd: price, direct: variant !== 1, stops: variant === 1 ? 1 : 0,
        remainingSeats: 0, airlines: ['Demo Air'], type: 'award', bookingCapability: 'mock',
        source: { id: 'fixture', label: 'Synthetic inventory' },
        pricing: { currency: 'USD', customerAmountUsd: price, unmarkedAmountUsd: price, markupPercentage: 0, basis: 'awardMilesEstimate' },
        retailComparison: { status: 'unavailable', currency: 'USD', source: { id: 'fixture-comparison', label: 'Synthetic comparison' } },
        // Intentionally omit times. The agent must not invent missing fields.
      });
    }
  }
  return results;
}
