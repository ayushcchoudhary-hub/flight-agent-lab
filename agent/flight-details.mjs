import { durationMin } from './shared.mjs';
// Match CommonSwyft's wall-clock display; do not reinterpret provider times
// through this laptop's timezone. Some records have misleading Z suffixes.
function clock(value) {
 if(typeof value!=='string')return null;
 const m=/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(value);
 if(!m||+m[2]>23||+m[3]>59)return null;
 const parsed=new Date(m[1]+'T00:00:00Z');
 if(!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==m[1])return null;
 return {date:m[1],time:`${+m[2]%12||12}:${m[3]} ${+m[2]<12?'AM':'PM'}`};
}
export function readableDate(date) {
 const value=new Date(date+'T00:00:00Z');
 return Number.isFinite(+value)?new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(value):date;
}
export function flightDetails(record) {
 const departure=clock(record.departsAt),arrival=clock(record.arrivesAt);
 const rawMinutes=durationMin(record);
 const minutes=Number.isFinite(rawMinutes)&&rawMinutes>0&&rawMinutes<Number.MAX_SAFE_INTEGER?Math.round(rawMinutes):null;
 const duration=minutes?`${Math.floor(minutes/60)}h ${minutes%60}m`:null;
 const flight=typeof record.flightNumbers==='string'&&record.flightNumbers.trim()?record.flightNumbers.trim():null;
 const parts=[departure?`Departs ${departure.time}`:'Departure time unavailable',arrival?`Arrives ${arrival.time}${!departure||arrival.date!==departure.date?` (${readableDate(arrival.date)})`:''}`:'Arrival time unavailable',[duration,flight].filter(Boolean).join(' · ')].filter(Boolean);
 return {departure,arrival,durationMinutes:minutes,flightNumbers:flight,text:parts.join('\n')};
}
