// Agent-owned boundary helpers. This file deliberately contains no imports from
// the product repository. It implements the small public contract the agent
// needs to search, validate and render flight results.
export const AIRPORTS = [
  ['LHR','London','London Heathrow Airport','GB'],['LGW','London','London Gatwick Airport','GB'],['LCY','London','London City Airport','GB'],['STN','London','London Stansted Airport','GB'],['LTN','London','London Luton Airport','GB'],
  ['JFK','New York','John F. Kennedy International Airport','US'],['EWR','New York','Newark Liberty International Airport','US'],['LGA','New York','LaGuardia Airport','US'],
  ['SFO','San Francisco','San Francisco International Airport','US'],['OAK','San Francisco','Oakland International Airport','US'],['SJC','San Francisco','San Jose Mineta International Airport','US'],
  ['SIN','Singapore','Singapore Changi Airport','SG'],['DXB','Dubai','Dubai International Airport','AE'],['AUH','Abu Dhabi','Zayed International Airport','AE'],
  ['CDG','Paris','Charles de Gaulle Airport','FR'],['ORY','Paris','Paris Orly Airport','FR'],['AMS','Amsterdam','Amsterdam Airport Schiphol','NL'],['FCO','Rome','Leonardo da Vinci Fiumicino Airport','IT'],
  ['IST','Istanbul','Istanbul Airport','TR'],['MEX','Mexico City','Mexico City International Airport','MX'],['PDX','Portland','Portland International Airport','US'],['LAX','Los Angeles','Los Angeles International Airport','US'],
  ['BOS','Boston','Boston Logan International Airport','US'],['ORD','Chicago','O’Hare International Airport','US'],['HND','Tokyo','Tokyo Haneda Airport','JP'],['NRT','Tokyo','Narita International Airport','JP'],['SYD','Sydney','Sydney Airport','AU'],['DEL','Delhi','Indira Gandhi International Airport','IN'],
].map(([code,city,name,country])=>({code,city,name,country}));
export const METRO_GROUPS = [
  {city:'London',label:'London (all airports)',code:'LHR|LGW|LCY|STN|LTN',country:'GB'},
  {city:'New York',label:'New York (all airports)',code:'JFK|EWR|LGA',country:'US'},
  {city:'San Francisco',label:'San Francisco Bay Area (all airports)',code:'SFO|OAK|SJC',country:'US'},
  {city:'Dubai',label:'Dubai and Abu Dhabi',code:'DXB|AUH',country:'AE'},
  {city:'Paris',label:'Paris (all airports)',code:'CDG|ORY',country:'FR'},
  {city:'Tokyo',label:'Tokyo (all airports)',code:'HND|NRT',country:'JP'},
];
const byCode=new Map(AIRPORTS.map(x=>[x.code,x]));
const clean=value=>String(value??'').trim().toLowerCase();
export const airportLabel=code=>byCode.has(code)?`${byCode.get(code).name} (${code})`:code;
export const expandMetro=value=>String(value).split('|').filter(code=>byCode.has(code));
export const labelForValue=value=>METRO_GROUPS.find(x=>x.code===value)?.label??expandMetro(value).map(airportLabel).join(', ');
export function rankAirportSearch(entries,term){
  const q=clean(term);if(!q)return [];
  return entries.map(entry=>{const fields=[entry.code,entry.city,entry.name,entry.label,entry.country].map(clean);const exact=fields.some(x=>x===q),prefix=fields.some(x=>x.startsWith(q)),contains=fields.some(x=>x.includes(q));return {entry,score:exact?100:prefix?70:contains?40:0};}).filter(x=>x.score).sort((a,b)=>b.score-a.score||Number(Boolean(b.entry.popular))-Number(Boolean(a.entry.popular))||String(a.entry.label).localeCompare(String(b.entry.label))).map(x=>x.entry);
}
export function shiftIso(value,days){const date=new Date(`${value}T00:00:00Z`);if(!Number.isFinite(+date))throw new Error('Invalid date.');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
export const flexRange=(anchor,days)=>({dateFrom:shiftIso(anchor,-days),dateTo:shiftIso(anchor,days)});
export const flexCallout=(anchor,date)=>Math.round((Date.parse(`${date}T00:00:00Z`)-Date.parse(`${anchor}T00:00:00Z`))/86400000);
export function displayPriceUsd(record){const value=record?.pricing?.customerAmountUsd??record?.arbPriceUsd;return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:NaN;}
export function durationMin(record){
  if(Number.isFinite(record?.durationMinutes))return record.durationMinutes;
  if(Array.isArray(record?.segments)&&record.segments.length&&record.segments.every(x=>Number.isFinite(x?.durationMin)))return record.segments.reduce((sum,x)=>sum+x.durationMin,0);
  const start=Date.parse(record?.departsAt),end=Date.parse(record?.arrivesAt);return Number.isFinite(start)&&Number.isFinite(end)&&end>=start?(end-start)/60000:NaN;
}
export function getResultsView(records,sort='recommended'){
  let results=[...records],nonstopFallback=false;if(sort==='nonstop'){const direct=results.filter(x=>x.direct===true);if(direct.length)results=direct;else nonstopFallback=true;}
  const price=x=>displayPriceUsd(x);if(sort==='cheapest')results.sort((a,b)=>price(a)-price(b));else if(sort==='fastest')results.sort((a,b)=>durationMin(a)-durationMin(b));else results.sort((a,b)=>Number(b.direct)-Number(a.direct)||price(a)-price(b));return {results,nonstopFallback};
}
export const sortResults=(records,sort)=>getResultsView(records,sort).results;
function validResult(record){return record&&typeof record==='object'&&typeof record.availabilityId==='string'&&typeof record.date==='string'&&typeof record.origin==='string'&&typeof record.destination==='string'&&typeof record.cabin==='string'&&typeof record.direct==='boolean'&&Number.isFinite(displayPriceUsd(record));}
export function validateSearchResponse(value){if(!value||typeof value!=='object'||typeof value.searchId!=='string'||!Array.isArray(value.results)||!value.results.every(validResult)||typeof value.totalFound!=='number')throw new Error('Flight search response is incompatible with the agent contract.');return value;}
export function createApiClient(base,{onRequest}={}){
  const call=async(method,path,{body}={})=>{const url=`${base.replace(/\/$/,'')}${path.startsWith('/')?path:`/${path}`}`;const request=new Request(url,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const response=onRequest?await onRequest({request}):await fetch(request);let data=null;try{data=await response.clone().json();}catch{}return response.ok?{data,response}:{error:data??{detail:'Request failed'},response};};
  return {POST:(path,options)=>call('POST',path,options),GET:(path,options)=>call('GET',path,options)};
}
export function flightSearchStatusQueryOptions(api,created){return {queryFn:async()=>{const {data,error,response}=await api.GET(`/flight-searches/${encodeURIComponent(created.searchId)}`);if(error||!data)throw new Error(`Flight search unavailable (HTTP ${response?.status??'unknown'}).`);return validateSearchResponse(data);}};}
export function formatFlightWallClockTime(value){const match=/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(String(value??''));if(!match)return null;return `${Number(match[2])%12||12}:${match[3]} ${Number(match[2])<12?'AM':'PM'}`;}
export function flightDayOffset(start,end){const a=String(start??'').slice(0,10),b=String(end??'').slice(0,10);return a&&b?flexCallout(a,b):0;}
