import { flightDetails,readableDate } from './flight-details.mjs';
import { AIRPORTS, METRO_GROUPS, expandMetro, labelForValue, rankAirportSearch, shiftIso, flexRange, getResultsView, displayPriceUsd } from './shared.mjs';
import { safeSearchError } from './customer-copy.mjs';

export const WELCOME = 'Where would you like to fly?\n\nTry “To New York”, “London to Singapore”, or “Dubai to London, economy”.\n\nDefaults: one-way · business class · today through the next 7 days.\nSearch only. There is no booking or checkout.';
const cabins = ['business', 'economy', 'premium', 'first', 'any'];
const sorts = ['recommended', 'cheapest', 'fastest', 'nonstop'];
const airportByCode = new Map(AIRPORTS.map(a => [a.code, a]));
const starterCities = ['London', 'New York', 'San Francisco', 'Singapore', 'Dubai'];
const aliases = { nyc: 'New York', 'new york city': 'New York', sf: 'San Francisco', 'san francisco bay area': 'San Francisco', 'bay area': 'San Francisco' };
const normal = text => text.trim().toLowerCase();
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function isoToday(timezone = 'Europe/London', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export function newState() {
  return { origin: null, destination: null, cabin: 'business', dates: null, sort: 'recommended', maxPriceUsd: null, nonstopOnly: false, cabinOnly: false, pending: null, snapshot: null, lastQuery: null };
}

export function resolveLocation(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 120) return [];
  const term = aliases[normal(text)] ?? text.trim();
  // Models and people can copy an airport label, not just its bare name/code.
  // Accept a corroborating label, but never silently trust a conflicting code.
  const labelled = term.match(/^(.*?)\s*\(([A-Z]{3})\)$/i);
  if (labelled) {
    const code = labelled[2].toUpperCase(), airport = airportByCode.get(code);
    const label = normal(labelled[1]);
    if (!airport || (label && !normal(airport.name ?? '').includes(label) && normal(airport.city) !== label)) return [];
    return [{ code, label: fullAirport(code) }];
  }
  const codes = term.toUpperCase().split('|').map(s => s.trim());
  if (codes.every(c => airportByCode.has(c))) return [{ code: [...new Set(codes)].join('|'), label: labelForValue(codes.join('|')) }];
  const group = METRO_GROUPS.find(g => normal(g.city) === normal(term) || normal(g.label) === normal(term));
  if (group) return [{ code: group.code, label: group.label }];
  const city = AIRPORTS.filter(a => normal(a.city) === normal(term));
  if (city.length === 1) return [{ code: city[0].code, label: fullAirport(city[0].code) }];
  const entries = [
    ...METRO_GROUPS.map(g => ({ code: g.code, label: g.label, matchCodes: expandMetro(g.code), city: g.city, name: g.label, country: g.country, popular: true })),
    ...AIRPORTS.map(a => ({ ...a, label: fullAirport(a.code), matchCodes: [a.code], name: a.name ?? a.city })),
  ];
  // A known airport name (e.g. Heathrow) is narrower than its metro group.
  const named = AIRPORTS.filter(a => (a.name ?? '').toLowerCase().includes(normal(term)));
  if (named.length === 1) return [{ code: named[0].code, label: fullAirport(named[0].code) }];
  return rankAirportSearch(entries, term).slice(0, 5).map(({ code, label }) => ({ code, label }));
}
export function fullAirport(code) {
  const a = airportByCode.get(code);
  return a ? `${a.name || a.city} (${code})` : code;
}

export const findTool = {
  type: 'function', function: {
    name: 'find_flights',
    description: 'Update only trip preferences explicitly supplied by the user, then search or ask for missing/ambiguous airports. If the user supplies a date, dates is required in this call. No dates in the user request means the application supplies today through today+7. No cabin means business. Existing state is preserved for omitted fields. Search-only; application selects the data environment. No bookings.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        origin: { type: 'string', description: 'Departure city or explicit airport/IATA codes. Use user wording; application resolves city groups. Omit if unknown.' },
        destination: { type: 'string', description: 'Destination city or explicit airport/IATA codes. Omit if unknown.' },
        dates: { type: 'object', description:'Required whenever the current user request explicitly supplies or changes a travel date. Omit only when the user supplies no date.', additionalProperties: false, required: ['mode'], properties: {
          mode: { type: 'string', enum: ['rolling', 'nextWeek', 'exact', 'range', 'flex'] },
          start: { type: 'string', description: 'YYYY-MM-DD; exact date, range start, or flex anchor. Required for exact/range/flex.' },
          end: { type: 'string', description: 'Inclusive range end. Required for range.' },
          flex: { type: 'integer', enum: [1, 3, 7], description: 'Days either side of start; required for flex.' },
          strict: { type: 'boolean', description: 'True only if user says exact dates only/no alternatives.' },
        } },
        cabin: { type: 'string', enum: cabins },
        cabinOnly: { type: 'boolean', description: 'True for explicit cabin-only restriction; false to allow cabin alternatives.' },
        sort: { type: 'string', enum: sorts },
        nonstopOnly: { type: 'boolean', description: 'True when user insists nonstop/direct only, not merely a preference.' },
        maxPriceUsd: { type: ['number', 'null'], description: 'Explicit USD total budget. Null clears the budget. Ask about currency if ambiguous.' },
        refresh: { type: 'boolean', description: 'True only when user asks to refresh/check availability again.' },
      },
    },
  },
};

function validatePatch(p) {
  if (!object(p)) throw new Error('Tool inputs must be an object.');
  const keys = Object.keys(findTool.function.parameters.properties);
  if (Object.keys(p).some(k => !keys.includes(k))) throw new Error('Unsupported tool field.');
  for (const field of ['origin', 'destination']) if (field in p && (typeof p[field] !== 'string' || !p[field].trim() || p[field].length > 120)) throw new Error(`Invalid ${field}.`);
  if ('cabin' in p && !cabins.includes(p.cabin)) throw new Error('Invalid cabin.');
  if ('sort' in p && !sorts.includes(p.sort)) throw new Error('Invalid sort.');
  for (const field of ['cabinOnly', 'nonstopOnly', 'refresh']) if (field in p && typeof p[field] !== 'boolean') throw new Error(`Invalid ${field}.`);
  if ('maxPriceUsd' in p && p.maxPriceUsd !== null && (typeof p.maxPriceUsd !== 'number' || !Number.isFinite(p.maxPriceUsd) || p.maxPriceUsd <= 0)) throw new Error('Budget must be a positive USD amount or null.');
}

function resolveDates(input, today) {
  if (!object(input) || Object.keys(input).some(k => !['mode', 'start', 'end', 'flex', 'strict'].includes(k))) throw new Error('Invalid date settings.');
  if ('strict' in input && typeof input.strict !== 'boolean') throw new Error('Invalid strict-date flag.');
  const mode = input.mode;
  let from, to, selected;
  if (mode === 'rolling') { from = today; to = shiftIso(today, 7); selected = today; }
  else if (mode === 'nextWeek') {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    from = shiftIso(today, weekday === 0 ? 1 : 8 - weekday); to = shiftIso(from, 6); selected = shiftIso(from, 3);
  } else {
    if (!validDate(input.start)) throw new Error('Please supply a valid calendar date (YYYY-MM-DD).');
    from = input.start;
    if (mode === 'exact') to = from;
    else if (mode === 'range') {
      if (!validDate(input.end)) throw new Error('Please supply a valid range end.');
      to = input.end;
    } else if (mode === 'flex' && [1, 3, 7].includes(input.flex)) {
      ({ dateFrom: from, dateTo: to } = flexRange(input.start, input.flex));
      from = from < today ? today : from;
    } else throw new Error('Invalid date mode or flexibility.');
    selected = mode === 'flex' ? input.start : from;
  }
  if (to < from) throw new Error('The end date must be on or after the start date.');
  if (from < today || selected < today) throw new Error('That departure date is in the past. What future date should I use?');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 30) throw new Error('This prototype searches up to 31 dates at once. Please narrow the range.');
  return { mode, from, to, selected, strict: input.strict ?? false };
}

function normalizePatch(patch) {
  if (!object(patch)) return patch;
  const normalized = { ...patch };
  for (const field of ['origin', 'destination']) {
    const value = normalized[field];
    if (field in normalized && (value == null || (typeof value === 'string' && !value.trim()))) {
      delete normalized[field];
    }
  }
  return normalized;
}

function mergeTripState(current, patch, today) {
  const next = { ...current };
  if (patch.dates) next.dates = resolveDates(patch.dates, today);

  for (const field of ['cabin', 'cabinOnly', 'sort', 'maxPriceUsd', 'nonstopOnly']) {
    if (field in patch) next[field] = patch[field];
  }

  let unresolved = null;
  for (const field of ['origin', 'destination']) {
    if (!(field in patch)) continue;
    const choices = resolveLocation(patch[field]);
    if (choices.length === 1) {
      next[field] = choices[0];
      next.pending = null;
    } else {
      next[field] = null;
      unresolved ??= { field, choices, query: patch[field] };
    }
  }
  return { next, unresolved };
}

export class SearchConversation {
  constructor({ adapter, today = () => isoToday(), trace = () => {} }) {
    this.adapter = adapter; this.today = today; this.trace = trace; this.state = newState();
  }
  publicState() { const { snapshot, lastQuery, ...state } = this.state; return state; }
  async choose(number) {
    const pending = this.state.pending;
    if (!pending) return { status: 'clarify', text: 'There is no active numbered menu. Please type the city, airport or preference you want to change.' };
    if (!Number.isInteger(number) || number < 1 || number > pending.choices.length) return { status: 'clarify', text: `Choose 1–${pending.choices.length}, or type a city/airport.` };
    return this.find({ [pending.field]: pending.choices[number - 1].code });
  }
  async find(patch) {
    try {
      // 1. Normalize and validate only the fields supplied in this turn.
      patch = normalizePatch(patch);
      validatePatch(patch);
      const today = this.today();
      if (!validDate(today)) throw new Error('Invalid test clock.');

      // 2. Merge the follow-up into a copy. Omitted fields remain unchanged.
      const { next, unresolved } = mergeTripState(this.state, patch, today);
      this.state = next;

      // 3. Resolve ambiguity or request the one route endpoint still missing.
      if (unresolved) {
        const heading = unresolved.choices.length
          ? `Which ${unresolved.field} did you mean?`
          : `I couldn't resolve “${unresolved.query}”. Type a city or airport code.`;
        return this.ask(unresolved.field, unresolved.choices, heading);
      }
      if (!next.origin || !next.destination) {
        const field = !next.destination ? 'destination' : 'origin';
        const opposite = next[field === 'origin' ? 'destination' : 'origin'];
        const choices = starterCities
          .flatMap(resolveLocation)
          .filter(choice => !opposite || !expandMetro(choice.code)
            .some(code => expandMetro(opposite.code).includes(code)));
        const heading = field === 'origin'
          ? 'Sounds good. Where are you flying from?'
          : 'Where would you like to fly?';
        return this.ask(field, choices, heading);
      }

      // 4. Apply deterministic defaults and reject conflicting state.
      next.pending = null;
      const origins = expandMetro(next.origin.code);
      const destinations = expandMetro(next.destination.code);
      if (origins.some(code => destinations.includes(code))) {
        return { status: 'clarify', text: 'Departure and destination overlap. Please choose a different city or non-overlapping airports.' };
      }
      if (!next.dates) next.dates = resolveDates({ mode: 'rolling' }, today);
      if (next.dates.from < today) {
        return { status: 'clarify', text: 'The saved date range now includes past dates. Say “use the coming week” or give new dates.' };
      }

      // 5. Search only when the effective query changed or refresh was explicit.
      const dates = next.dates;
      const range = dates.mode === 'exact'
        ? flexRange(dates.selected, 1)
        : { dateFrom: dates.from, dateTo: dates.to };
      const query = {
        origin: next.origin.code,
        destination: next.destination.code,
        dateFrom: range.dateFrom < today ? today : range.dateFrom,
        dateTo: range.dateTo,
        selectedDate: dates.selected,
        cabin: next.cabin,
      };
      const key = JSON.stringify(query);
      const cached = !patch.refresh && next.lastQuery === key && next.snapshot;
      const response = cached ? next.snapshot : await this.adapter.search(query);
      next.snapshot = response;
      next.lastQuery = key;
      this.trace('search_result', { query, cached: Boolean(cached), count: response.totalFound, searchId: response.searchId });
      return present(next, response, Boolean(cached), this.adapter.mode);
    } catch (error) {
      const internal = error instanceof Error ? error.message : String(error);
      this.trace('error', { text: internal });
      return { status: 'error', text: safeSearchError(error) };
    }
  }
  ask(field, choices, heading) {
    this.state.pending = choices.length ? { field, choices } : null;
    const examples = choices.slice(0, 5).map(c => c.label.replace(/\s*\(all airports\)$/i, '')).join(', ');
    const cabinLabel = { economy: 'Economy', premium: 'Premium economy', premium_economy: 'Premium economy', business: 'Business class', first: 'First class', any: 'Any cabin' }[this.state.cabin] ?? this.state.cabin;
    const dateLabel = this.state.dates
      ? this.state.dates.from === this.state.dates.to ? readableDate(this.state.dates.from) : `${readableDate(this.state.dates.from)} – ${readableDate(this.state.dates.to)}`
      : null;
    const retained = this.state.dates || this.state.cabin !== 'business'
      ? `I'll keep ${[cabinLabel, dateLabel].filter(Boolean).join(' · ')} unless you change it.`
      : null;
    return { status: 'clarify', text: [heading, examples ? `Try ${examples}, or type any city or airport.` : 'Type a city or airport.', retained].filter(Boolean).join('\n\n') };
  }
}

function present(state, response, cached, mode = 'synthetic') {
  const staging = mode === 'staging' || mode === 'replay';
  const replay = mode === 'replay';
  const d = state.dates;
  let results = response.results.filter(r => r.origin !== r.destination);
  if (state.maxPriceUsd !== null) results = results.filter(r => displayPriceUsd(r) <= state.maxPriceUsd);
  if (state.nonstopOnly) results = results.filter(r => r.direct);
  if (state.cabinOnly && state.cabin !== 'any') results = results.filter(r => r.cabin === state.cabin);
  if (d.strict) results = results.filter(r => r.date >= d.from && r.date <= d.to);
  const view = getResultsView(results, state.sort);
  const matching = [], alternatives = [];
  for (const r of view.results) {
    const reasons = [];
    if (r.date < d.from || r.date > d.to) reasons.push('nearby date');
    if (state.cabin !== 'any' && r.cabin !== state.cabin) reasons.push('different cabin');
    if (view.nonstopFallback) reasons.push('connection; no nonstop match');
    (reasons.length ? alternatives : matching).push({ record: r, reasons });
  }
  const shortlist = [...matching, ...alternatives].slice(0, 3).map(({ record: r, reasons }) => ({
    id: r.availabilityId, origin: r.origin, destination: r.destination, date: r.date,
    cabin: r.cabin, priceUsd: displayPriceUsd(r), direct: r.direct, reasons,
    timing: flightDetails(r),
    text: `${fullAirport(r.origin)} → ${fullAirport(r.destination)}\n${readableDate(r.date)}\n${r.cabin.charAt(0).toUpperCase()+r.cabin.slice(1)} · ${r.direct ? 'Nonstop' : 'With a connection'} · USD ${displayPriceUsd(r).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}\n${flightDetails(r).text}${reasons.length ? `\nAlternative: ${reasons.join(', ')}` : ''}`,
  }));
  const dateSummary=d.from===d.to?readableDate(d.from):`${readableDate(d.from)} – ${readableDate(d.to)}`;
  const text = [
    !staging?'SYNTHETIC FLIGHT DATA. These are example results.':replay?'Saved results. This is not a fresh availability check.':null,
    `${state.origin.label} → ${state.destination.label}\n${dateSummary} · ${state.cabin === 'any' ? 'Any cabin' : state.cabin.charAt(0).toUpperCase()+state.cabin.slice(1)} · One-way${state.maxPriceUsd !== null ? ` · Up to USD ${state.maxPriceUsd}` : ''}${state.nonstopOnly ? ' · Nonstop only' : ''}`,
    cached?'Using the same results. Say “refresh availability” for a new check.':null,
    shortlist.length?`I found ${shortlist.length===1?'one option':`${shortlist.length} options`} for you${alternatives.length&&!matching.length?' on nearby dates or with different flight details':''}:`:'No flights match those preferences in these results. Would you like to try different dates?',
    ...shortlist.map((r,i)=>`${String.fromCharCode(65+i)}. ${r.text}`),
    shortlist.length?'Prices are estimates and may change.':null,
    !staging?'Missing flight times and exact seat counts are not available.':null,
    shortlist.length?'You can ask me to change the dates, cabin or airport.':null,
  ].filter(Boolean).join('\n\n');
  return { status: 'results', text, dataMode: mode, query: response.query, shortlist, cached, totalFound: response.totalFound, matchingCount: matching.length };
}

export function welcomeFor(mode) {
  if(mode==='replay')return WELCOME.replace('today through the next 7 days','the saved search date through 7 days later');
  if(mode==='staging')return WELCOME;
  return WELCOME+'\n\nDemo mode: synthetic flight data.';
}
