// Expected outcomes are specified independently of the model and search helpers.
// Fixed clock and fixed routes make repeated runs and model comparisons comparable.
export const EVAL_CLOCK = '2026-09-18';
export const CITY_CODES = {
  London: 'LHR|LGW|LCY|STN|LTN', 'New York': 'JFK|EWR|LGA',
  'San Francisco': 'SFO|OAK|SJC', Singapore: 'SIN', Dubai: 'DXB|AUH',
};
const complete = (origin, destination) => ({ status: 'results', origin: CITY_CODES[origin], destination: CITY_CODES[destination], cabin: 'business', from: '2026-10-01', to: '2026-10-01', posts: 1, minResults: 1 });
const rolling = (origin, destination) => ({ ...complete(origin, destination), from: '2026-09-18', to: '2026-09-25' });
export const EVAL_CASES = [
  ...[['London','New York'], ['New York','San Francisco'], ['San Francisco','Singapore'], ['Singapore','Dubai'], ['Dubai','London']].map(([from,to],i) => ({
    id: `R${i+1}`, name: `Complete trip: ${from} → ${to}`,
    steps: [{ text: `Find me a flight from ${from} to ${to} on October 1, 2026.`, expected: complete(from,to) }],
  })),
  { id:'H1', name:'Natural day-month date must override the default window', steps:[
    { text:'London to New York on 3 October, business.', expected:{ ...complete('London','New York'), from:'2026-10-03', to:'2026-10-03' } },
  ] },
  { id: 'M1', name: 'Origin only → destination menu → select', steps: [
    { text: 'I want to fly from London.', expected: { status:'clarify', origin:CITY_CODES.London, destination:null, pending:'destination', menuCount:4, posts:0 } },
    { text: '1', expected: rolling('London','New York') },
  ] },
  { id: 'M2', name: 'Destination only → origin menu → select', steps: [
    { text: 'I want to go to New York.', expected: { status:'clarify', origin:null, destination:CITY_CODES['New York'], pending:'origin', menuCount:4, posts:0 } },
    { text:'1', expected:rolling('London','New York') },
  ] },
  { id:'M3', name:'Both locations, no date → use default', steps:[
    { text:'London to New York please.', expected:rolling('London','New York') },
  ] },
  { id:'D1', name:'Next week → next calendar Monday–Sunday', steps:[
    { text:'London to New York sometime next week.', expected:{ ...rolling('London','New York'), from:'2026-09-21', to:'2026-09-27' } },
  ] },
  { id:'F1', name:'Airport and cabin refinements retain date and budget', steps:[
    { text:'London to New York on October 1, 2026, economy, under USD 600.', expected:{ ...complete('London','New York'), cabin:'economy', budget:600 } },
    { text:'Heathrow only, please.', expected:{ ...complete('London','New York'), origin:'LHR', cabin:'economy', budget:600, posts:2 } },
    { text:'Business instead, but keep the budget.', expected:{ ...complete('London','New York'), origin:'LHR', budget:600, posts:3, minResults:0, resultCount:0 } },
  ] },
  { id:'U1', name:'Round trip must not silently become one-way', steps:[
    { text:'London to New York October 1, returning October 8, 2026.', expected:{ status:'clarify', posts:0, mentions:'round|return|one.way' } },
  ] },
  { id:'U2', name:'Two travelers must not silently become one', steps:[
    { text:'London to New York October 1, 2026, for two adults.', expected:{ status:'clarify', posts:0, mentions:'traveler|traveller|passenger|adult|one person|single' } },
  ] },
  { id:'E1', name:'Inventory outage is not “no flights”', scenario:'unavailable', steps:[
    { text:'London to New York October 1, 2026.', expected:{ status:'error', posts:1, mentions:"couldn't check flights" } },
  ] },
  { id:'E2', name:'Empty inventory is not an outage', scenario:'empty', steps:[
    { text:'London to New York October 1, 2026.', expected:{ ...complete('London','New York'), minResults:0, resultCount:0 } },
  ] },
  { id:'V1', name:'Invalid calendar date blocked', steps:[
    { text:'London to New York on February 30, 2027.', expected:{ statuses:['clarify','error'], posts:0 } },
  ] },
];

export function gradeStep(expected, result, conversation, adapter) {
  const s=conversation.publicState();
  const actual={ status:result.status, origin:s.origin?.code??null, destination:s.destination?.code??null,
    cabin:s.cabin, from:s.dates?.from??null, to:s.dates?.to??null, budget:s.maxPriceUsd,
    pending:s.pending?.field??null, menuCount:s.pending?.choices?.length??0,
    posts:adapter.calls.filter(c=>c.method==='POST').length, resultCount:result.shortlist?.length??0 };
  const checks=[];
  for (const [key,value] of Object.entries(expected)) {
    const pass = key==='minResults' ? actual.resultCount>=value : key==='statuses' ? value.includes(actual.status)
      : key==='mentions' ? new RegExp(value,'i').test(result.text) : actual[key]===value;
    checks.push({name:key,expected:value,actual:key==='mentions'?result.text:key==='minResults'?actual.resultCount:key==='statuses'?actual.status:actual[key],pass});
  }
  if(result.status==='results') {
    checks.push({name:'data source is labelled',pass:adapter.mode==='staging'?result.dataMode==='staging':adapter.mode==='replay'?result.dataMode==='replay'&&/Saved results/.test(result.text):/synthetic|simulated/i.test(result.text)});
    checks.push({name:'route matches saved preference',pass:result.query?.origin===actual.origin&&result.query?.destination===actual.destination});
    checks.push({name:'each result respects route and budget',pass:(result.shortlist??[]).every(r=>actual.origin.split('|').includes(r.origin)&&actual.destination.split('|').includes(r.destination)&&(actual.budget===null||r.priceUsd<=actual.budget))});
  }
  if(s.pending) checks.push({name:'menu excludes opposite city',pass:s.pending.choices.every(c=>!(s.pending.field==='origin'?s.destination:s.origin)?.code.split('|').some(code=>c.code.split('|').includes(code)))});
  return {pass:checks.every(c=>c.pass),actual,checks};
}
