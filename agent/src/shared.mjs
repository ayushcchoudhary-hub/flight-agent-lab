// Agent-owned boundary helpers. This file deliberately contains no imports from
// the product repository. It implements the small public contract the agent
// needs to search, validate and render flight results.
import { GENERATED_AIRPORT_ROWS, GENERATED_METRO_ROWS } from './airports.generated.mjs';

// Reference data is generated from the product's table (OurAirports open data)
// so the agent resolves the same places the product serves. See
// tools/sync-airports.mjs.
export const AIRPORTS = GENERATED_AIRPORT_ROWS.map(([code, city, name, country, countryCode, type]) =>
  ({ code, city, name, country, countryCode, type }));
export const METRO_GROUPS = GENERATED_METRO_ROWS.map(([code, city, label, country]) =>
  ({ code, city, label, country }));

// A hub is a curated metro group or a large airport. Used to decide when an
// exact match on an obscure field should still offer a likelier alternative:
// "Sidney" matches Sidney, Montana exactly, but the traveler probably means
// Sydney.
const LARGE = 'large_airport';
const isHub = entry => Boolean(entry.popular) || entry.type === LARGE;

// Country words the traveler is likely to type but the data does not carry.
const COUNTRY_ALIASES = new Map([
  ['uk', 'United Kingdom'], ['u.k.', 'United Kingdom'], ['britain', 'United Kingdom'],
  ['great britain', 'United Kingdom'], ['england', 'United Kingdom'],
  ['usa', 'United States'], ['u.s.', 'United States'], ['u.s.a.', 'United States'],
  ['america', 'United States'], ['uae', 'United Arab Emirates'],
  ['holland', 'Netherlands'], ['south korea', 'Korea, Republic of'],
]);
export const countryAlias = text => COUNTRY_ALIASES.get(String(text ?? '').trim().toLowerCase()) ?? null;

const byCode=new Map(AIRPORTS.map(x=>[x.code,x]));
const clean=value=>String(value??'').trim().toLowerCase();
export const airportLabel=code=>byCode.has(code)?`${byCode.get(code).name} (${code})`:code;
export const expandMetro=value=>String(value).split('|').filter(code=>byCode.has(code));
export const labelForValue=value=>METRO_GROUPS.find(x=>x.code===value)?.label??expandMetro(value).map(airportLabel).join(', ');
// Ranks an exact or prefix hit on the field a traveler is most likely typing
// (code, then city) above an incidental substring hit in a longer field, so
// "IST" surfaces Istanbul before Afghan-IST-an. Ported from the product's
// airportSearch so both resolve the same way.
const TIER = { CODE_EXACT:0, CODE_PREFIX:1, CITY_EXACT:2, CITY_PREFIX:3, NAME_PREFIX:4, COUNTRY_PREFIX:5, CITY_SUBSTRING:6, NAME_SUBSTRING:7, COUNTRY_SUBSTRING:8, CODE_SUBSTRING:9 };
// City names carry disambiguators, e.g. "Paris (Roissy-en-France, Val-d'Oise)",
// so compare words rather than the whole string.
const words=value=>clean(value).split(/[^a-z0-9]+/).filter(Boolean);
const matchCodesOf=entry=>(entry.matchCodes??String(entry.code??'').split('|')).map(clean);

function tokenScore(entry,token){
  const codes=matchCodesOf(entry);
  if(codes.includes(token))return TIER.CODE_EXACT;
  if(codes.some(code=>code.startsWith(token)))return TIER.CODE_PREFIX;
  const cityWords=words(entry.city);
  if(cityWords.includes(token))return TIER.CITY_EXACT;
  if(cityWords.some(word=>word.startsWith(token)))return TIER.CITY_PREFIX;
  if(words(entry.name).some(word=>word.startsWith(token)))return TIER.NAME_PREFIX;
  if(words(entry.country).some(word=>word.startsWith(token)))return TIER.COUNTRY_PREFIX;
  if(clean(entry.city).includes(token))return TIER.CITY_SUBSTRING;
  if(clean(entry.name).includes(token))return TIER.NAME_SUBSTRING;
  if(clean(entry.country).includes(token))return TIER.COUNTRY_SUBSTRING;
  if(codes.some(code=>code.includes(token)))return TIER.CODE_SUBSTRING;
  return null;
}
// Every token must match somewhere; the score is the sum of each token's best
// tier, so a tighter multi-word match still outranks a looser one.
function queryScore(entry,query){
  const tokens=clean(query).split(/\s+/).filter(Boolean);
  if(!tokens.length)return 0;
  let total=0;
  for(const token of tokens){const score=tokenScore(entry,token);if(score===null)return null;total+=score;}
  return total;
}
// Equal-scoring matches rank by how likely a traveler wants them. A country
// query matches every airport in it, and alphabetical order put Aguni and
// Tokunoshima beside Tokyo.
const SIZE_RANK={large_airport:1,medium_airport:2,small_airport:3,seaplane_base:4,heliport:5};
const placeRank=entry=>entry.popular?0:SIZE_RANK[entry.type]??6;
const byRank=(a,b)=>a.score-b.score||placeRank(a.entry)-placeRank(b.entry)||String(a.entry.city).localeCompare(String(b.entry.city));
export function rankAirportSearch(entries,term){
  const scored=[];
  for(const entry of entries){const score=queryScore(entry,term);if(score!==null)scored.push({entry,score});}
  return scored.sort(byRank).map(item=>item.entry);
}

// Levenshtein distance, abandoned once it exceeds `max`. Neither the agent nor
// the product could resolve a misspelling before this: "Heathrw" only worked
// because the model silently corrected it, while "Londn" and "Sidney" failed.
export function editDistance(a,b,max=2){
  if(Math.abs(a.length-b.length)>max)return max+1;
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i+=1){
    const current=[i];let best=i;
    for(let j=1;j<=b.length;j+=1){
      const cost=a[i-1]===b[j-1]?0:1;
      current[j]=Math.min(previous[j]+1,current[j-1]+1,previous[j-1]+cost);
      if(current[j]<best)best=current[j];
    }
    if(best>max)return max+1;
    previous=current;
  }
  return previous[b.length];
}
// One edit for short words, two once a word is long enough that a second typo
// stays unambiguous.
const budgetFor=token=>token.length>=8?2:token.length>=4?1:0;
export function nearMatches(entries,term){
  const token=clean(term);
  const budget=budgetFor(token);
  if(!budget)return [];
  const scored=[];
  for(const entry of entries){
    if(queryScore(entry,term)!==null)continue;
    let best=budget+1;
    for(const word of [...words(entry.city),...words(entry.name)]){
      if(Math.abs(word.length-token.length)>budget)continue;
      const distance=editDistance(word,token,budget);
      if(distance<best)best=distance;
    }
    if(best<=budget)scored.push({entry,score:best});
  }
  return scored.sort(byRank).map(item=>item.entry);
}
// A metro group already covers its members, so drop members when the group is
// present. Keeps "Londn" a single confident answer instead of a five-way menu.
export function collapseToGroups(entries){
  const covered=new Set(entries.filter(entry=>entry.popular).flatMap(entry=>matchCodesOf(entry)));
  return entries.filter(entry=>entry.popular||!matchCodesOf(entry).every(code=>covered.has(code)));
}
export const hubsAmong=entries=>entries.filter(isHub);

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
