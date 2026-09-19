import test from 'node:test';
import assert from 'node:assert/strict';
import {flightDetails} from '../flight-details.mjs';
import {SearchConversation} from '../search.mjs';
import {verifyFlightData} from '../verify-flight-data.mjs';
test('flight times match website wall clocks; explicit segment duration wins over misleading UTC subtraction',()=>{
 const d=flightDetails({origin:'LHR',destination:'JFK',flightNumbers:'BA183',departsAt:'2026-10-03T19:25:00Z',arrivesAt:'2026-10-03T22:25:00Z',segments:[{durationMin:480}]});
 assert.deepEqual(d.departure,{date:'2026-10-03',time:'7:25 PM'});assert.deepEqual(d.arrival,{date:'2026-10-03',time:'10:25 PM'});assert.equal(d.durationMinutes,480);assert.match(d.text,/8h 0m/);
});
test('overnight arrival retains its actual calendar date and does not use laptop timezone',()=>{
 const d=flightDetails({origin:'JFK',destination:'LHR',departsAt:'2026-10-03T23:30:00-04:00',arrivesAt:'2026-10-04T11:30:00+01:00',segments:[{durationMin:420}]});
 assert.equal(d.arrival.date,'2026-10-04');assert.equal(d.departure.time,'11:30 PM');assert.match(d.text,/11:30 AM \(Sun, 4 Oct 2026\)/);
});
test('missing and invalid timestamps do not become invented departure times',()=>{
 const d=flightDetails({departsAt:'2026-02-30T25:01:00',origin:'LHR',destination:'JFK'});assert.equal(d.departure,null);assert.equal(d.arrival,null);assert.equal(d.durationMinutes,null);assert.match(d.text,/Departure time unavailable/);
});
test('adapter flight timing is rendered and corrupt timing is rejected by grounding',async()=>{
 const query={origin:'LHR|LGW|LCY|STN|LTN',destination:'JFK|EWR|LGA',dateFrom:'2026-10-02',dateTo:'2026-10-04',selectedDate:'2026-10-03',cabin:'business'};
 const record={availabilityId:'fixture-timed-flight',date:'2026-10-03',origin:'LHR',destination:'JFK',cabin:'business',direct:true,departsAt:'2026-10-03T19:25:00Z',arrivesAt:'2026-10-03T22:25:00Z',flightNumbers:'BA183',segments:[{durationMin:480}],pricing:{customerAmountUsd:2450}};
 const snapshot={searchId:'fixture-timing',query,totalFound:1,results:[record]};
 const adapter={mode:'replay',calls:[],snapshots:[],async search(input){this.calls.push({method:'POST',body:structuredClone(input)});this.snapshots.push(snapshot);return snapshot;}};
 const c=new SearchConversation({adapter,today:()=> '2026-09-19'});
 const r=await c.find({origin:'London',destination:'New York',dates:{mode:'exact',start:'2026-10-03'}});
 assert.equal(verifyFlightData(r,snapshot,query).pass,true);assert.match(r.text,/Departs 7:25 PM/);assert.match(r.text,/8h 0m/);
 r.shortlist[0].timing.departure.time='00:00';assert.equal(verifyFlightData(r,snapshot,query).pass,false);
});

test('12-hour display handles midnight and noon without timezone shifts',()=>{
 const d=flightDetails({departsAt:'2026-10-03T00:05:00Z',arrivesAt:'2026-10-03T12:00:00Z'});
 assert.equal(d.departure.time,'12:05 AM');assert.equal(d.arrival.time,'12:00 PM');
});
