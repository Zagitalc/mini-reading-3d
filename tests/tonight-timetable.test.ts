import test from 'node:test';
import assert from 'node:assert/strict';
import {localDate,tonightDepartures,type StopIndex,type StopTimetable,type StopTime} from '../shared/timetable';

const index=(validFrom='20260101',validUntil='20261231'):Pick<StopIndex,'validFrom'|'validUntil'|'timezone'>=>({validFrom,validUntil,timezone:'Europe/London'});
const fixture=(times:StopTime[]=[],serviceDate='20260926'):StopTimetable=>({
 schema:1,stopId:'station',timezone:'Europe/London',
 services:[{start:serviceDate,end:serviceDate,weekdays:'1111111',exceptions:{}}],
 trips:[{id:'outbound',service:0,routeId:'17',headsign:'Wokingham Road',direction:'0'}],times,
});
const iso=(time:number)=>new Date(time).toISOString();

test('tonight ends at the next local 04:00, including just before and exactly at the cutoff',()=>{
 const cases=[
  ['2026-09-26T18:00:00Z','2026-09-27T03:00:00.000Z'],
  ['2026-09-27T00:30:00Z','2026-09-27T03:00:00.000Z'],
  ['2026-09-27T02:59:59Z','2026-09-27T03:00:00.000Z'],
  ['2026-09-27T03:00:00Z','2026-09-28T03:00:00.000Z'],
  ['2026-12-26T18:00:00Z','2026-12-27T04:00:00.000Z'],
 ];
 for(const [now,expected]of cases){
  const board=tonightDepartures(fixture(),index(),Date.parse(now));
  assert.equal(iso(board.start),new Date(now).toISOString());
  assert.equal(iso(board.end),expected,now);
 }
});

test('the local 04:00 cutoff follows both UK clock changes rather than adding a fixed number of hours',()=>{
 const spring=tonightDepartures(fixture([], '20260328'),index(),Date.parse('2026-03-28T23:00:00Z'));
 assert.equal(iso(spring.end),'2026-03-29T03:00:00.000Z');
 assert.equal((spring.end-spring.start)/3600000,4);
 const autumn=tonightDepartures(fixture([], '20261024'),index(),Date.parse('2026-10-24T22:00:00Z'));
 assert.equal(iso(autumn.end),'2026-10-25T04:00:00.000Z');
 assert.equal((autumn.end-autumn.start)/3600000,6);
 // Both occurrences of 01:30 during the autumn clock change have the same cutoff.
 for(const now of ['2026-10-25T00:30:00Z','2026-10-25T01:30:00Z']){
  assert.equal(iso(tonightDepartures(fixture(),index(),Date.parse(now)).end),'2026-10-25T04:00:00.000Z');
 }
});

test('overnight trips retain their GTFS service date but have tomorrow calendar dates; cutoff is exclusive',()=>{
 const data=fixture([[0,23*3600,1,0,0],[0,25*3600,2,0,0],[0,28*3600,3,0,0]]);
 const board=tonightDepartures(data,index(),Date.parse('2026-09-26T22:00:00Z'));
 assert.equal(board.departures.length,2);
 assert.deepEqual(board.departures.map(d=>iso(d.time)),['2026-09-26T22:00:00.000Z','2026-09-27T00:00:00.000Z']);
 assert.deepEqual(board.departures.map(d=>d.serviceDate),['20260926','20260926']);
 assert.equal(localDate(board.departures[1].time,data.timezone),'20260927');
 assert.deepEqual(board.afterMidnightRouteIds,['17']);
 const afterMidnight=tonightDepartures(data,index(),Date.parse('2026-09-26T23:30:00Z'));
 assert.equal(afterMidnight.departures.length,1);
 assert.equal(afterMidnight.departures[0].serviceDate,'20260926');
});

test('night board honours removed and added services, including the previous service day',()=>{
 const data=fixture([[0,25*3600,1,0,0]]);
 data.services[0].exceptions={'20260926':2};
 assert.deepEqual(tonightDepartures(data,index(),Date.parse('2026-09-26T23:30:00Z')).departures,[]);
 data.services[0].weekdays='0000000';
 data.services[0].exceptions={'20260926':1};
 const board=tonightDepartures(data,index(),Date.parse('2026-09-26T23:30:00Z'));
 assert.equal(board.departures.length,1);
 assert.equal(board.departures[0].serviceDate,'20260926');
});

test('night board includes every eligible departure rather than truncating at twelve',()=>{
 const times:StopTime[]=Array.from({length:20},(_,i)=>[0,20*3600+i*15*60,i+1,0,0]);
 const board=tonightDepartures(fixture(times),index(),Date.parse('2026-09-26T18:00:00Z'));
 assert.equal(board.departures.length,20);
 assert.equal(iso(board.departures.at(-1)!.time),'2026-09-26T23:45:00.000Z');
});

test('routes, directions, stop headsigns and boarding qualifications survive the night filter',()=>{
 const data=fixture([[0,24*3600,7,1,2,'Reading Station'],[1,25*3600,8,0,0],[1,26*3600,9,0,1]]);
 data.trips.push({id:'inbound',service:0,routeId:'21',headsign:'Central Reading',direction:'1'});
 const board=tonightDepartures(data,index(),Date.parse('2026-09-26T20:00:00Z'));
 assert.deepEqual(board.departures.map(({tripId,routeId,headsign,direction,sequence,approximate,pickupType})=>({tripId,routeId,headsign,direction,sequence,approximate,pickupType})),[
  {tripId:'outbound',routeId:'17',headsign:'Reading Station',direction:'0',sequence:7,approximate:true,pickupType:2},
  {tripId:'inbound',routeId:'21',headsign:'Central Reading',direction:'1',sequence:8,approximate:false,pickupType:0},
 ]);
 assert.deepEqual(board.afterMidnightRouteIds,['17','21']);
});

test('expired and future feeds are distinct from a valid night with no departures',()=>{
 const data=fixture([[0,25*3600,1,0,0]]),now=Date.parse('2026-09-26T18:00:00Z');
 for(const [coverage,state]of [[index('20260901','20260925'),'expired'],[index('20260927','20261025'),'future']] as const){
  const board=tonightDepartures(data,coverage,now);
  assert.equal(board.state,state);
  assert.deepEqual(board.departures,[]);
  assert.deepEqual(board.afterMidnightRouteIds,[]);
 }
 const empty=tonightDepartures(fixture(),index(),now);
 assert.equal(empty.state,'current');
 assert.deepEqual(empty.departures,[]);
});

test('a feed ending tonight is partial but retains its valid service-day departures after midnight',()=>{
 const data=fixture([[0,25*3600,1,0,0]]),coverage=index('20260901','20260926');
 // A stop payload may span more service dates than the advertised feed validity.
 // Do not present a new service day outside that validity as confirmed coverage.
 data.services[0].end='20260927';
 data.times.push([0,15*60,2,0,0]);
 const board=tonightDepartures(data,coverage,Date.parse('2026-09-26T18:00:00Z'));
 assert.equal(board.state,'partial');
 assert.equal(board.departures.length,1);
 assert.equal(board.departures[0].serviceDate,'20260926');
 // Before 04:00 on the last valid calendar date the complete window is still covered.
 assert.equal(tonightDepartures(data,coverage,Date.parse('2026-09-26T00:00:00Z')).state,'current');
 // Once that final calendar date has ended, existing app expiry semantics are conservative.
 const expired=tonightDepartures(data,coverage,Date.parse('2026-09-26T23:30:00Z'));
 assert.equal(expired.state,'expired');
 assert.deepEqual(expired.departures,[]);
});
