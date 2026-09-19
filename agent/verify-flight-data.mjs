import { displayPriceUsd } from './shared.mjs';
import { flightDetails,readableDate } from './flight-details.mjs';
import { fullAirport } from './search.mjs';

// Independently compare each displayed offer with the captured API snapshot.
export function verifyFlightData(result, snapshot, requestedQuery) {
  const checks = [];
  const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
  check('Search completed', result.status === 'results');
  for (const field of ['origin', 'destination', 'dateFrom', 'dateTo', 'selectedDate']) {
    check(`Backend query preserves ${field}`, snapshot?.query?.[field] === requestedQuery?.[field]);
  }
  check('Backend query preserves cabin', (snapshot?.query?.cabin || 'any') === (requestedQuery?.cabin || 'any'));
  for (const offer of result.shortlist || []) {
    const candidates = snapshot.results.filter(r => r.availabilityId === offer.id && r.origin === offer.origin && r.destination === offer.destination && r.date === offer.date && r.cabin === offer.cabin);
    const record = candidates.find(r => displayPriceUsd(r) === offer.priceUsd && r.direct === offer.direct);
    check(`${offer.id}: ID, route, date, cabin, price and stops agree with API`, record);
    check(`${offer.id}: airports belong to requested city groups`, requestedQuery.origin.split('|').includes(offer.origin) && requestedQuery.destination.split('|').includes(offer.destination));
    if (record) {
      const timing=flightDetails(record);
      check(`${offer.id}: times, arrival date, duration and flight number agree with API`, JSON.stringify(offer.timing)===JSON.stringify(timing)&&offer.text.includes(timing.text));
      const expected = `${fullAirport(record.origin)} → ${fullAirport(record.destination)}\n${readableDate(record.date)}\n${record.cabin.charAt(0).toUpperCase()+record.cabin.slice(1)} · ${record.direct ? 'Nonstop' : 'With a connection'} · USD ${displayPriceUsd(record).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
      check(`${offer.id}: displayed message faithfully includes the record`, offer.text.startsWith(expected) && result.text.includes(offer.text));
    }
  }
  check('Offer count is a shortlist of at most three', (result.shortlist || []).length <= 3);
  return { pass: checks.every(c => c.pass), checks, displayedOffers: result.shortlist?.length || 0 };
}
