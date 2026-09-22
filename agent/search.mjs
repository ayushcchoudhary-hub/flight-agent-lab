import { flightDetails,readableDate } from './flight-details.mjs';
import { AIRPORTS, METRO_GROUPS, expandMetro, labelForValue, rankAirportSearch, nearMatches, collapseToGroups, hubsAmong, countryAlias, shiftIso, flexRange, getResultsView, displayPriceUsd } from './shared.mjs';
import { safeCustomerCopy, safeSearchError } from './customer-copy.mjs';

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
  return { origin: null, destination: null, cabin: 'business', dates: null, sort: 'recommended', maxPriceUsd: null, nonstopOnly: false, cabinOnly: false, pending: null, originFromPreference: false, cabinSource: 'default', snapshot: null, lastQuery: null };
}

const choiceOf = entry => ({ code: entry.code, label: entry.label ?? fullAirport(entry.code) });
const isHubEntry = entry => hubsAmong([entry]).length > 0;

// Every airport and metro group the resolver can offer, in the shape the
// ranker expects. A group matches on any member code, so typing "LGW" still
// surfaces "London (all airports)".
function searchableEntries() {
  return [
    ...METRO_GROUPS.map(group => ({ code: group.code, label: group.label, matchCodes: expandMetro(group.code), city: group.city, name: group.label, country: group.country, popular: true })),
    ...AIRPORTS.map(airport => ({ ...airport, label: fullAirport(airport.code), matchCodes: [airport.code], name: airport.name ?? airport.city })),
  ];
}

export function resolveLocation(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 120) return [];
  // Places now arrive exactly as typed, so "the UK" and "the States" carry
  // their article. Strip it before any lookup.
  const bare = text.trim().replace(/^(?:the|a|an)\s+/i, '');
  const term = aliases[normal(bare)] ?? countryAlias(bare) ?? bare;
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
  const entries = searchableEntries();
  const city = AIRPORTS.filter(a => normal(a.city) === normal(term));
  if (city.length === 1) {
    const only = choiceOf({ ...city[0], label: fullAirport(city[0].code) });
    // An exact city match on a minor field is still probably a typo for a
    // nearby hub: "Sidney" is a real airport in Montana, but the traveler
    // most likely means Sydney. Offer both rather than guessing.
    if (isHubEntry(city[0])) return [only];
    const rivals = collapseToGroups(hubsAmong(nearMatches(entries, term))).slice(0, 4);
    return rivals.length ? [only, ...rivals.map(choiceOf)] : [only];
  }
  // A known airport name (e.g. Heathrow) is narrower than its metro group.
  const named = AIRPORTS.filter(a => (a.name ?? '').toLowerCase().includes(normal(term)));
  if (named.length === 1) return [{ code: named[0].code, label: fullAirport(named[0].code) }];
  const ranked = rankAirportSearch(entries, term);
  if (ranked.length) return ranked.slice(0, 5).map(choiceOf);
  // Nothing matched literally. Fall back to near matches so a misspelling
  // resolves deterministically instead of depending on the model correcting
  // it. One hub among them is a confident answer; anything else is a menu.
  const near = collapseToGroups(nearMatches(entries, term));
  // A curated metro group is the strongest signal: one edit from "London"
  // means the London group, not East London or Southend.
  const groups = near.filter(entry => entry.popular);
  if (groups.length === 1) return [choiceOf(groups[0])];
  const hubs = hubsAmong(near);
  if (hubs.length === 1) return [choiceOf(hubs[0])];
  return near.slice(0, 5).map(choiceOf);
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
        origin: { type: 'string', description: 'Departure place exactly as the traveler wrote it, misspellings included. The application resolves it. Omit if unknown.' },
        destination: { type: 'string', description: 'Destination exactly as the traveler wrote it, misspellings included. Omit if unknown.' },
        dates: { type: 'object', description:'Required whenever the current user request explicitly supplies or changes a travel date. Omit only when the user supplies no date.', additionalProperties: false, required: ['mode'], properties: {
          mode: { type: 'string', enum: ['rolling', 'nextWeek', 'exact', 'range', 'flex', 'ambiguous'] },
          start: { type: 'string', description: 'YYYY-MM-DD; exact date, range start, or flex anchor. Required for exact/range/flex.' },
          end: { type: 'string', description: 'Inclusive range end. Required for range.' },
          flex: { type: 'integer', enum: [1, 3, 7], description: 'Days either side of start; required for flex.' },
          strict: { type: 'boolean', description: 'True only if user says exact dates only/no alternatives.' },
          options: { type: 'array', items: { type: 'string' }, description: 'Required for ambiguous: the YYYY-MM-DD dates the wording could mean, e.g. "2/10" gives both readings. Send the trip you already know in the same call so it is not lost.' },
        } },
        cabin: { type: 'string', enum: cabins },
        cabinOnly: { type: 'boolean', description: 'True for explicit cabin-only restriction; false to allow cabin alternatives.' },
        sort: { type: 'string', enum: sorts },
        nonstopOnly: { type: 'boolean', description: 'True when user insists nonstop/direct only, not merely a preference.' },
        maxPriceUsd: { type: ['number', 'null'], description: 'Explicit USD total budget. Null clears the budget. Ask about currency if ambiguous.' },
        refresh: { type: 'boolean', description: 'True only when user asks to refresh/check availability again.' },
        aside: { type: 'string', maxLength: 200, description: 'One or two short sentences answering a non-travel question asked in the same message, by saying you cannot help with it and offering the travel use case. Example: "I can’t say much about Lisbon in winter. I can search flights there if you like." Omit when the request is only about flights.' },
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
  if ('aside' in p && (typeof p.aside !== 'string' || p.aside.length > 200)) throw new Error('Invalid aside.');
  if ('sort' in p && !sorts.includes(p.sort)) throw new Error('Invalid sort.');
  for (const field of ['cabinOnly', 'nonstopOnly', 'refresh']) if (field in p && typeof p[field] !== 'boolean') throw new Error(`Invalid ${field}.`);
  if ('maxPriceUsd' in p && p.maxPriceUsd !== null && (typeof p.maxPriceUsd !== 'number' || !Number.isFinite(p.maxPriceUsd) || p.maxPriceUsd <= 0)) throw new Error('Budget must be a positive USD amount or null.');
}

function resolveDates(input, today) {
  // 'options' belongs to the ambiguous mode, which never reaches here. Models
  // still attach it to ordinary date modes, and rejecting the whole patch for
  // that turned a normal search into an error. Accept and ignore it.
  if (!object(input) || Object.keys(input).some(k => !['mode', 'start', 'end', 'flex', 'strict', 'options'].includes(k))) throw new Error('Invalid date settings.');
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

// An ambiguous date is a clarification, not a search. The model still calls
// find_flights so the trip it already knows reaches application state, which
// holds state precedence (see PROMPT-ARCHITECTURE.md). Held-out v2 A6 failed
// because the model answered in prose instead and nothing was retained.
function ambiguousDates(input, today) {
  if (!object(input) || input.mode !== 'ambiguous') return null;
  const options = Array.isArray(input.options) ? [...new Set(input.options)] : [];
  const usable = options.filter(value => validDate(value) && value >= today);
  return usable.length >= 2 ? usable.slice(0, 4).map(iso => ({ code: iso, label: readableDate(iso) })) : 'unusable';
}

function mergeTripState(current, patch, today) {
  const next = { ...current };
  if (patch.dates) next.dates = resolveDates(patch.dates, today);

  for (const field of ['cabin', 'cabinOnly', 'sort', 'maxPriceUsd', 'nonstopOnly']) {
    if (field in patch) next[field] = patch[field];
  }
  // A stated cabin is a choice even when it matches the value already held,
  // so the header must not label it a default.
  if ('cabin' in patch) next.cabinSource = 'stated';

  let unresolved = null;
  for (const field of ['origin', 'destination']) {
    if (!(field in patch)) continue;
    const choices = resolveLocation(patch[field]);
    if (choices.length === 1) {
      next[field] = choices[0];
      if (field === 'origin') next.originFromPreference = false;
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
    const chosen = pending.choices[number - 1];
    if (pending.field === 'dates') return this.find({ dates: { mode: 'exact', start: chosen.code } });
    return this.find({ [pending.field]: chosen.code });
  }
  async find(patch) {
    try {
      // 1. Normalize and validate only the fields supplied in this turn.
      patch = normalizePatch(patch);
      validatePatch(patch);
      const today = this.today();
      if (!validDate(today)) throw new Error('Invalid test clock.');
      // An off-topic question asked alongside a flight request is answered in
      // one line above the results. It is copy for this reply only, so it is
      // reviewed like any other model text and never merged into the trip.
      const aside = 'aside' in patch ? safeCustomerCopy(patch.aside, '') : '';
      if ('aside' in patch) { patch = { ...patch }; delete patch.aside; }
      const candidates = ambiguousDates(patch.dates, today);
      if (candidates) { patch = { ...patch }; delete patch.dates; }

      // 2. Merge the follow-up into a copy. Omitted fields remain unchanged.
      const previous = this.state;
      const { next, unresolved } = mergeTripState(this.state, patch, today);
      this.state = next;

      // 3. Resolve ambiguity or request the one route endpoint still missing.
      if (unresolved) {
        const heading = unresolved.choices.length
          ? `Which ${unresolved.field} did you mean?`
          : `I couldn't resolve “${unresolved.query}”. Which ${unresolved.field} did you mean?`;
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
        return this.ask(field, choices, heading, { numbered: false });
      }

      // An ambiguous date stops here. The route, cabin and everything else the
      // traveler supplied is already merged above, so the answer builds on it.
      if (candidates === 'unusable') {
        this.state.pending = null;
        return { status: 'clarify', text: 'Which date did you mean? Please give it as a day and month.' };
      }
      if (candidates) {
        this.state.pending = { field: 'dates', choices: candidates };
        const numbered = candidates.map((choice, index) => `${index + 1}. ${choice.label}`).join('\n');
        const route = `${next.origin.label} to ${next.destination.label}`;
        return { status: 'clarify', text: [`Which date did you mean for ${route}?`, numbered, 'Reply with the number or a different date.'].join('\n\n') };
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
      const applied = previous.lastQuery ? describeApplied(previous, next, patch) : [];
      return present(next, response, Boolean(cached), this.adapter.mode, { aside, applied });
    } catch (error) {
      const internal = error instanceof Error ? error.message : String(error);
      this.trace('error', { text: internal });
      return { status: 'error', text: safeSearchError(error) };
    }
  }
  // A numbered menu is right when the choices ARE the candidates, and wrong
  // when they are only examples: the judge read a numbered starter list as
  // "invented or hardcoded options ... the only available routes".
  ask(field, choices, heading, { numbered = true } = {}) {
    this.state.pending = choices.length ? { field, choices } : null;
    const shown = choices.slice(0, 5);
    const menu = numbered
      ? shown.map((choice, index) => `${index + 1}. ${choice.label}`).join('\n')
      : null;
    const examples = shown.map(choice => choice.label.replace(/\s*\(all airports\)$/i, '')).join(', ');
    const cabinLabel = { economy: 'Economy', premium: 'Premium economy', premium_economy: 'Premium economy', business: 'Business class', first: 'First class', any: 'Any cabin' }[this.state.cabin] ?? this.state.cabin;
    const dateLabel = this.state.dates
      ? this.state.dates.from === this.state.dates.to ? readableDate(this.state.dates.from) : `${readableDate(this.state.dates.from)} – ${readableDate(this.state.dates.to)}`
      : null;
    const retained = this.state.dates || this.state.cabin !== 'business'
      ? `I'll keep ${[cabinLabel, dateLabel].filter(Boolean).join(' · ')} unless you change it.`
      : null;
    const body = menu
      ? [menu, 'Reply with the number, or type any city or airport.']
      : [examples ? `Try ${examples}, or type any city or airport.` : 'Type a city or airport.'];
    return { status: 'clarify', text: [heading, ...body, retained].filter(Boolean).join('\n\n') };
  }
}

// Say where the cabin came from. Held-out v2 D4: after "remember I like
// business" and "nothing saved yet", a plain "Business" looked like the unsaved
// preference had been applied. It was the default all along.
function cabinLabel(state) {
  const name = state.cabin === 'any' ? 'Any cabin' : state.cabin.charAt(0).toUpperCase() + state.cabin.slice(1);
  if (state.cabinSource === 'preference') return `${name} (saved default)`;
  if (state.cabinSource === 'default') return `${state.cabin === 'business' ? 'Business class' : name} (default)`;
  return name;
}

// Phase 1 of the checkout handoff (PRODUCT-ROADMAP.md): send the traveler to
// the same search on the product site, where selection, quoting and checkout
// already live. The link carries route, date window and cabin only, never a
// price, so the page always shows current fares. The grammar is the product's
// public URL: /search/{from}-{to}-{ddmmyy}[-cabin][-fN], pipe-joined metro
// codes, flex 1, 3 or 7. Cabin tokens already match.
export const PRODUCT_WEB_BASE = process.env.PRODUCT_WEB_BASE || 'https://commonswyft.com';
const ddmmyy = iso => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}`;
const dayCount = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
export function productSearchPath(state) {
  const { origin, destination, dates, cabin } = state;
  if (!origin?.code || !destination?.code || !dates?.selected) return null;
  const width = dayCount(dates.from, dates.to);
  // An exact date has no window. A range maps to the nearest product window
  // around the selected date; the page floors past dates itself.
  const flex = dates.mode === 'flex' ? [1, 3, 7].find(n => n >= (width / 2)) ?? 7
    : width <= 0 ? 0 : width <= 2 ? 1 : width <= 6 ? 3 : 7;
  const cabinSuffix = cabin && cabin !== 'any' ? `-${cabin}` : '';
  // The product encodes the metro pipe as %7C in the links it shares.
  const code = value => value.replaceAll('|', '%7C');
  return `/search/${code(origin.code)}-${code(destination.code)}-${ddmmyy(dates.selected)}${cabinSuffix}${flex ? `-f${flex}` : ''}`;
}
export const productSearchUrl = state => { const path = productSearchPath(state); return path ? `${PRODUCT_WEB_BASE}${path}` : null; };

// Held-out v2 C1 and C2: sort, nonstop and budget changes came back under
// "Using the same results", which reads as nothing happened even when three
// new fares appeared. Say what was applied instead, and say when the list was
// already in the state the traveler asked for.
const SORT_SENTENCE = { recommended: 'our recommended order', cheapest: 'cheapest first', fastest: 'fastest first', nonstop: 'nonstop first' };
const SORT_HEADER = { cheapest: 'Cheapest first', fastest: 'Fastest first', nonstop: 'Nonstop first' };
const cabinName = cabin => (cabin === 'any' ? 'any cabin' : cabin === 'business' ? 'business class' : cabin === 'premium' ? 'premium economy' : `${cabin} class`);

export function describeApplied(previous, next, patch) {
  const applied = [];
  const changed = field => field in patch && patch[field] !== previous[field];
  const restated = field => field in patch && patch[field] === previous[field];

  if (changed('cabin')) applied.push(`Cabin changed to ${cabinName(next.cabin)}.`);
  else if (restated('cabin')) applied.push(`Already searching ${cabinName(next.cabin)}.`);

  if (changed('sort')) applied.push(`Sorted by ${SORT_SENTENCE[next.sort]}.`);
  else if (restated('sort')) applied.push(`Already sorted by ${SORT_SENTENCE[next.sort]}.`);

  if (changed('nonstopOnly')) applied.push(next.nonstopOnly ? 'Showing nonstop flights only.' : 'Nonstop-only filter removed.');
  else if (restated('nonstopOnly') && next.nonstopOnly) applied.push('Already showing nonstop flights only.');

  if (changed('cabinOnly')) applied.push(next.cabinOnly ? `Showing ${cabinName(next.cabin)} only.` : 'Other cabins are allowed again.');

  if (changed('maxPriceUsd')) applied.push(next.maxPriceUsd === null ? 'Budget removed.' : `Budget set to USD ${next.maxPriceUsd}.`);
  else if (restated('maxPriceUsd') && next.maxPriceUsd !== null) applied.push(`Budget is already USD ${next.maxPriceUsd}.`);

  return applied;
}

// Held-out v2 C1: "premium instead" under a USD 700 budget answered "No
// flights match those preferences in these results. Would you like to try
// different dates?" while the cached results held premium fares from USD
// 1,113. The date was never the problem. Name the filter that removed them,
// and keep the date suggestion for when nothing matches at all.
function activeFilters(state) {
  const d = state.dates;
  const filters = [];
  if (state.maxPriceUsd !== null) filters.push({ key: 'budget', keep: r => displayPriceUsd(r) <= state.maxPriceUsd });
  if (state.nonstopOnly) filters.push({ key: 'nonstop', keep: r => r.direct });
  if (state.cabinOnly && state.cabin !== 'any') filters.push({ key: 'cabinOnly', keep: r => r.cabin === state.cabin });
  if (d.strict) filters.push({ key: 'dates', keep: r => r.date >= d.from && r.date <= d.to });
  return filters;
}

export function blockedByFilter(state, unfiltered, filters = activeFilters(state)) {
  if (!filters.length || !unfiltered.length) return null;
  const without = key => unfiltered.filter(row => filters.every(f => f.key === key || f.keep(row)));
  const when = state.dates.from === state.dates.to ? `on ${readableDate(state.dates.from)}` : 'in this date range';
  const cabinWord = state.cabin === 'any' ? 'Flights' : cabinName(state.cabin).replace(/^./, c => c.toUpperCase());

  const overBudget = without('budget');
  if (overBudget.length) {
    const inCabin = state.cabin === 'any' ? overBudget : overBudget.filter(r => r.cabin === state.cabin);
    const rows = inCabin.length ? inCabin : overBudget;
    const cheapest = Math.min(...rows.map(displayPriceUsd));
    const label = inCabin.length ? cabinWord : 'The cheapest fare';
    return `${label} ${when} starts at USD ${cheapest.toLocaleString('en-US', { maximumFractionDigits: 0 })}, above your USD ${state.maxPriceUsd} budget. Raise or remove the budget?`;
  }
  if (without('nonstop').length) return `Nothing nonstop is in these results ${when}. Shall I include flights with a connection?`;
  if (without('cabinOnly').length) return `No ${cabinName(state.cabin)} fares are in these results ${when}. Shall I show the other cabins?`;
  if (without('dates').length) return 'Nothing matches inside those exact dates. Shall I show nearby dates?';
  return 'Nothing in these results matches all of those filters together. Which one should I relax?';
}

function present(state, response, cached, mode = 'synthetic', { aside = '', applied = [] } = {}) {
  const staging = mode === 'staging' || mode === 'replay';
  const replay = mode === 'replay';
  const d = state.dates;
  const unfiltered = response.results.filter(r => r.origin !== r.destination);
  const filters = activeFilters(state);
  const results = unfiltered.filter(row => filters.every(f => f.keep(row)));
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
    aside||null,
    `${state.origin.label} → ${state.destination.label}\n${dateSummary} · ${cabinLabel(state)} · One-way${state.maxPriceUsd !== null ? ` · Up to USD ${state.maxPriceUsd}` : ''}${state.nonstopOnly ? ' · Nonstop only' : ''}${SORT_HEADER[state.sort] ? ` · ${SORT_HEADER[state.sort]}` : ''}`,
    state.originFromPreference?`Using your saved home airport, ${state.origin.label}. Say where you are flying from to change it.`:null,
    applied.length
      ? `${applied.join(' ')}${cached ? ' This uses the same search. Say “refresh availability” for a new check.' : ''}`
      : cached ? 'Using the same results. Say “refresh availability” for a new check.' : null,
    shortlist.length?`I found ${shortlist.length===1?'one option':`${shortlist.length} options`} for you${alternatives.length&&!matching.length?' on nearby dates or with different flight details':''}:`:(blockedByFilter(state,unfiltered,filters)??'No flights match those preferences in these results. Would you like to try different dates?'),
    ...shortlist.map((r,i)=>`${String.fromCharCode(65+i)}. ${r.text}`),
    shortlist.length?'Prices are estimates and may change.':null,
    !staging?'Missing flight times and exact seat counts are not available.':null,
    shortlist.length?'You can ask me to change the dates, cabin or airport.':null,
    productSearchUrl(state)?`To pick a flight and check out, continue on CommonSwyft:\n${productSearchUrl(state)}`:null,
  ].filter(Boolean).join('\n\n');
  return { status: 'results', text, dataMode: mode, query: response.query, shortlist, cached, totalFound: response.totalFound, matchingCount: matching.length };
}

export function welcomeFor(mode) {
  if(mode==='replay')return WELCOME.replace('today through the next 7 days','the saved search date through 7 days later');
  if(mode==='staging')return WELCOME;
  return WELCOME+'\n\nDemo mode: synthetic flight data.';
}
