import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTimetable} from '../scripts/compile-timetable';
import {serviceRuns,serviceOrigin,scheduledDepartures,parseGtfsTime,timetableExpired,type StopTimetable,type TimetableService} from '../shared/timetable';
const service:TimetableService={start:'20260901',end:'20260930',weekdays:'1111100',exceptions:{'20260916':2,'20260919':1}};
test('calendar weekdays, validity and added/removed service exceptions',()=>{
 assert.equal(serviceRuns(service,'20260915'),true);assert.equal(serviceRuns(service,'20260916'),false);assert.equal(serviceRuns(service,'20260919'),true);assert.equal(serviceRuns(service,'20260920'),false);assert.equal(serviceRuns(service,'20261001'),false);
 assert.equal(serviceRuns({...service,exceptions:{'20261001':1}},'20261001'),true);
 assert.equal(timetableExpired({validUntil:'20260918',timezone:'Europe/London'},Date.parse('2026-09-18T23:01Z')),true);
});
test('service origin respects London summer time and both DST transitions',()=>{
 for(const [date,iso]of [['20260112','2026-01-12T00:00:00.000Z'],['20260916','2026-09-15T23:00:00.000Z'],['20260329','2026-03-28T23:00:00.000Z'],['20261025','2026-10-25T00:00:00.000Z']])assert.equal(new Date(serviceOrigin(date)).toISOString(),iso);
 assert.equal(parseGtfsTime('25:10:00'),90600);assert.equal(parseGtfsTime('8:05:00'),29100);for(const s of ['','12:99:00','bad','-1:00:00'])assert.equal(parseGtfsTime(s),undefined);
});
const data=():StopTimetable=>({schema:1,stopId:'a',timezone:'Europe/London',services:[{...service,exceptions:{}}],trips:[{id:'night',service:0,routeId:'17',headsign:'Town',direction:'0'}],times:[[0,25*3600,4,1,0],[0,26*3600,5,0,1],[0,27*3600,6,0,2,'Station']]});
test('departures carry previous service day past midnight, exclude alighting-only and retain precision/pickup/headsign',()=>{
 const result=scheduledDepartures(data(),Date.parse('2026-09-16T23:30:00Z'),4);
 assert.equal(result.length,2);assert.equal(result[0].serviceDate,'20260916');assert.equal(new Date(result[0].time).toISOString(),'2026-09-17T00:00:00.000Z');assert.equal(result[0].approximate,true);assert.equal(result[1].headsign,'Station');assert.equal(result[1].pickupType,2);
 assert.equal(scheduledDepartures(data(),Date.parse('2026-10-03T08:00Z')).length,0);
});
test('removed service does not leak into an overnight board',()=>{
 const d=data();d.services[0].exceptions={'20260916':2};assert.equal(scheduledDepartures(d,Date.parse('2026-09-16T23:30Z'),4).length,0);
});
test('stop-to-trip joins verify serving routes, preserve sequences and omit untimed/frequency predictions',()=>{
 const files:Record<string,Record<string,string>[]>={
  'agency.txt':[{agency_timezone:'Europe/London'}],
  'routes.txt':[{route_id:'R',route_short_name:'17'},{route_id:'unused',route_short_name:'99'}],
  'trips.txt':[{trip_id:'T',route_id:'R',service_id:'S',trip_headsign:'Town',direction_id:'0'},{trip_id:'F',route_id:'R',service_id:'S'}],
  'stops.txt':[{stop_id:'A',stop_name:'Station',stop_lon:'-.97',stop_lat:'51.45'},{stop_id:'B',stop_name:'Unused',stop_lon:'-.97',stop_lat:'51.45'}],
  'calendar_dates.txt':[{service_id:'S',date:'20260916',exception_type:'1'}],
  'frequencies.txt':[{trip_id:'F'}],
  'stop_times.txt':[{stop_id:'A',trip_id:'T',departure_time:'25:00:00',stop_sequence:'4',timepoint:'0',pickup_type:'0'},{stop_id:'A',trip_id:'T',departure_time:'',stop_sequence:'5'},{stop_id:'A',trip_id:'T',departure_time:'26:00:00',stop_sequence:'6',pickup_type:'1'},{stop_id:'A',trip_id:'F',departure_time:'08:00:00',stop_sequence:'1'},{stop_id:'A',trip_id:'T',departure_time:'27:00:00',stop_sequence:'7'},{stop_id:'A',trip_id:'F',departure_time:'09:00:00',stop_sequence:'2'}]
 };
 const result=compileTimetable(f=>files[f]??[],{source:'Test',sourceUrl:'https://example.org',licence:'test',retrievedAt:'2026-09-16T00:00Z'},'test');
 assert.equal(result.index.stops.length,1);assert.deepEqual(result.index.stops[0].routeIds,['R']);assert.equal(result.index.routes.unused,undefined);assert.equal(result.index.omitted.missingTimes,1);assert.equal(result.index.omitted.frequencyTrips,1);
 const stop=[...result.files.values()][0];assert.equal(stop.times.length,2);assert.equal(stop.times[0][1],90000);assert.equal(stop.times[0][2],4);assert.equal(stop.times[0][3],1);assert.equal(stop.times[1][4],1);assert.equal(serviceRuns(stop.services[0],'20260916'),true);
 files['trips.txt'][0].service_id='missing';assert.throws(()=>compileTimetable(f=>files[f]??[],{source:'Test',sourceUrl:'',licence:'',retrievedAt:''},'test'),/Missing route\/calendar/);
});
