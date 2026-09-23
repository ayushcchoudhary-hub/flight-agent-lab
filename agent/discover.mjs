// "Take me anywhere": ranked deals from the product's public deals feed
// (GET /v1/discover/flights). Application code owns every word of a deals
// reply. The model only decides that the traveler wants ideas; it never names
// a destination, and every city shown here comes from the feed itself.
import { readableDate } from './flight-details.mjs';

export const EVERYWHERE = 'Everywhere';
export const DEALS_SHOWN = 5;
export const WELCOME_DEALS_SHOWN = 3;
export const DEAL_FOOTNOTE = 'Deals can change or sell out quickly.';
const CABIN_NAMES = { business: 'business class', first: 'first class' };
const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();

// Feed text is external data, not instructions. Keep printable characters only
// and cap the length, so nothing from the feed can reshape a reply.
const clean = (value, max = 60) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f<>`*_\\[\]{}|]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';
const validDateString = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const iata = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null;
const money = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const usd = value => `USD ${Math.round(value).toLocaleString('en-US')}`;
export const countryName = code => {
  if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) return clean(code, 40);
  try { return regionNames?.of(code) ?? code; } catch { return code; }
};

// Validate the feed document and keep only the fields a reply uses. A
// malformed document is rejected rather than half-rendered.
export function validateDiscoverResponse(doc) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.tiles)) throw new Error('The deals feed returned an unexpected response.');
  if (typeof doc.stale !== 'boolean' || typeof doc.generated_at !== 'string') throw new Error('The deals feed returned an unexpected response.');
  const deals = [];
  for (const tile of doc.tiles) {
    const deal = {
      city: clean(tile?.city), country: countryName(tile?.country), airport: iata(tile?.airport), origin: iata(tile?.origin),
      originCity: clean(tile?.origin_metro), date: tile?.date, cabin: tile?.cabin, priceUsd: money(tile?.price_usd),
      retailUsd: money(tile?.retail_usd), stops: Number.isInteger(tile?.stops) && tile.stops >= 0 ? tile.stops : null,
      via: Array.isArray(tile?.via_cities) ? tile.via_cities.map(v => clean(v, 40)).filter(Boolean).slice(0, 2) : [],
      region: clean(tile?.region, 40), subRegion: clean(tile?.sub_region, 40),
    };
    if (!deal.city || !deal.airport || !deal.origin || !validDateString(deal.date) || !CABIN_NAMES[deal.cabin] || !deal.priceUsd || deal.stops === null) throw new Error('The deals feed returned an unexpected response.');
    if (deal.origin === deal.airport) continue;
    deals.push(deal);
  }
  return {
    metro: clean(doc.metro, 40), multiOrigin: doc.multi_origin === true, generatedAt: doc.generated_at.slice(0, 10),
    stale: doc.stale, deals,
  };
}

// The departure city the feed knows a place by. A metro group carries its
// city; a single airport's city drops OurAirports disambiguators such as
// "London, Essex" or "Sydney (Mascot)".
export function departureCity(place, { airportByCode, metroGroups }) {
  if (!place?.code) return null;
  const group = metroGroups.find(g => g.code === place.code);
  if (group) return group.city;
  const airport = airportByCode.get(place.code.split('|')[0]);
  return airport ? airport.city.split(/[(,]/)[0].trim() : null;
}

const matchesRegion = (deal, region) => {
  if (!region) return true;
  const want = region.toLowerCase().trim();
  return [deal.region, deal.subRegion, deal.country, deal.city].some(v => v && v.toLowerCase().includes(want));
};

// The feed decides what is current: product decision 2026-09-23. Deals are
// shown in the feed's order even when dated in the past, which should only
// happen on a stale staging feed. A past deal chosen by number is searched
// from today instead (see SearchConversation.chooseDeal).
export function filterDeals(deals, { cabin = 'business', region = null, maxPriceUsd = null } = {}) {
  return deals.filter(deal => deal.cabin === cabin && matchesRegion(deal, region) && (maxPriceUsd === null || deal.priceUsd <= maxPriceUsd));
}

const shortDate = iso => { const [, month, day] = iso.split('-').map(Number); return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][month - 1]}`; };
const routeLine = deal => deal.stops === 0 ? 'Nonstop' : `${deal.stops} stop${deal.stops > 1 ? 's' : ''}${deal.via.length ? ` via ${deal.via.join(', ')}` : ''}`;
export const dealLabel = deal => `${deal.city}, ${deal.country}`;

function dealLines(deal, index, { showOrigin }) {
  const from = showOrigin && deal.originCity ? `${deal.originCity} → ` : '';
  const price = `${usd(deal.priceUsd)}${deal.retailUsd && deal.retailUsd > deal.priceUsd ? ` · usually ${usd(deal.retailUsd)}` : ''}`;
  return `${index + 1}. ${from}${dealLabel(deal)} · ${readableDate(deal.date)} · ${routeLine(deal)}\n   ${price}`;
}

// A numbered menu the conversation can resolve with choose(n).
export const dealChoices = deals => deals.map(deal => ({ code: deal.airport, label: dealLabel(deal), deal: { origin: deal.origin, airport: deal.airport, date: deal.date, cabin: deal.cabin, city: deal.city } }));

export function renderDeals({ feed, deals, cabin = 'business', originCity = null, notice = null, disclosure = null, region = null }) {
  const cabinName = CABIN_NAMES[cabin];
  const where = originCity ? `from ${originCity}` : 'across our departure cities';
  const inRegion = region ? ` in ${clean(region, 40)}` : '';
  const heading = `Best ${cabinName} deals${inRegion} ${where} · checked ${shortDate(feed.generatedAt)}. Prices can change.`;
  return [
    notice, disclosure, heading,
    deals.map((deal, i) => dealLines(deal, i, { showOrigin: !originCity })).join('\n'),
    DEAL_FOOTNOTE,
    originCity ? 'Reply with a number to search that flight, or name a place.' : 'Reply with a number to search that flight, or tell me where you’re flying from for deals from there.',
  ].filter(Boolean).join('\n\n');
}

export function renderWelcomeDeals({ feed, deals }) {
  return [
    'Top deals',
    deals.map((deal, i) => dealLines(deal, i, { showOrigin: true })).join('\n'),
    `Checked ${shortDate(feed.generatedAt)}. ${DEAL_FOOTNOTE} Reply with a number to search one.`,
  ].join('\n\n');
}

export const NO_ECONOMY_DEALS = 'These deals are business and first class only. I can search a specific route in economy. Where would you like to fly?';
export const noCurrentDeals = originCity => `I don’t have current deals ${originCity ? `from ${originCity}` : 'right now'}${originCity ? ' right now' : ''}. Tell me a destination and I’ll search it.`;
export const noRegionDeals = (region, originCity) => `I don’t have ${clean(region, 40)} deals ${originCity ? `from ${originCity}` : 'across our departure cities'} right now. Here are the best deals instead.`;
export const unknownOriginNotice = place => `I don’t have deals from ${clean(place, 40)} yet. Here are the best deals across our departure cities.`;
