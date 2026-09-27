import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loopDestination,type TripCall} from '../scripts/loop-destinations';
import {compileTimetable} from '../scripts/compile-timetable';
import type {LngLat,Place} from '../shared/types';
const fixture=JSON.parse(readFileSync('tests/fixtures/loop-routes.json','utf8')) as {routes:Record<string,(TripCall&{stop:string})[]>;places:Place[]};
const station:LngLat=[-0.9719,51.4586],woodley:LngLat=[-0.9047,51.4530],hurst:LngLat=[-0.8570,51.4520];
const places:Place[]=[{id:'r',name:'Reading',kind:'town',position:station},{id:'w',name:'Woodley',kind:'town',position:woodley},{id:'h',name:'Hurst',kind:'village',position:hurst},{id:'s',name:'Woodley Airfield',kind:'locality',position:[-0.8900,51.4540]}];
const east=(sequence:number,lng:number):TripCall=>({sequence,position:[lng,51.456]});
// Out along the London Road to Woodley and back to the station stand.
const loop=[east(1,-0.9719),east(2,-0.95),east(3,-0.93),east(4,-0.91),east(5,-0.90),east(6,-0.895),east(7,-0.905),east(8,-0.93),east(9,-0.9716)];
test('a loop announces the area on its far side until it turns',()=>{
 assert.deepEqual(loopDestination(loop,places),{label:'Woodley',beforeSequence:6},'the Woodley Airfield locality is nearer the turn but does not name an area');
 assert.deepEqual(loopDestination([...loop].reverse(),places),{label:'Woodley',beforeSequence:6},'calls are ordered by sequence, not input order');
});
test('trips that end elsewhere, short shuttles and loops within the home area keep the GTFS destination',()=>{
 assert.equal(loopDestination(loop.slice(0,6),places),undefined,'ends in Woodley, not back at the station');
 assert.equal(loopDestination([east(1,-0.9719),east(2,-0.965),east(3,-0.96),east(4,-0.9716)],places),undefined,'under 1.5 km out');
 assert.equal(loopDestination(loop,[places[0]]),undefined,'no area other than the one it started in');
 assert.equal(loopDestination(loop,[]),undefined);assert.equal(loopDestination(loop.slice(0,2),places),undefined);
});
test('bundled Reading Buses loops: the 13 reads Woodley from Blagrave Street and the 23 reads Caversham Park',()=>{
 const thirteen=fixture.routes['13'],result=loopDestination(thirteen,fixture.places)!;
 assert.equal(result.label,'Woodley');assert.equal(thirteen[0].stop,'Blagrave Street');assert.ok(thirteen[0].sequence<result.beforeSequence);
 assert.equal(thirteen.find(c=>c.sequence===result.beforeSequence)?.stop,'Sandford Lane');
 assert.equal(loopDestination(fixture.routes['23'],fixture.places)?.label,'Caversham Park');
});
test('compiled stop timetables carry the loop destination before the turn and the GTFS headsign after it',()=>{
 const stops=loop.map((c,i)=>({stop_id:`S${i+1}`,stop_name:`Stop ${i+1}`,stop_lon:String(c.position[0]),stop_lat:String(c.position[1])}));
 const files:Record<string,Record<string,string>[]>={
  'agency.txt':[{agency_timezone:'Europe/London'}],'routes.txt':[{route_id:'R13',route_short_name:'13'}],
  'trips.txt':[{trip_id:'L',route_id:'R13',service_id:'S',trip_headsign:'Reading Station',direction_id:'0'}],'stops.txt':stops,
  'calendar_dates.txt':[{service_id:'S',date:'20260927',exception_type:'1'}],
  'stop_times.txt':loop.map((c,i)=>({trip_id:'L',stop_id:`S${i+1}`,stop_sequence:String(c.sequence),departure_time:`08:${String(10+i).padStart(2,'0')}:00`,...(i===1?{stop_headsign:'London Road'}:{})}))
 };
 const provenance={source:'Test',sourceUrl:'',licence:'',retrievedAt:''},headsigns=(result:ReturnType<typeof compileTimetable>)=>Object.fromEntries([...result.files.values()].map(f=>[f.stopId,f.times[0][5]??f.trips[0].headsign]));
 assert.deepEqual(headsigns(compileTimetable(f=>files[f]??[],provenance,'test',places)),{S1:'Woodley',S2:'London Road',S3:'Woodley',S4:'Woodley',S5:'Woodley',S6:'Reading Station',S7:'Reading Station',S8:'Reading Station'});
 assert.equal(headsigns(compileTimetable(f=>files[f]??[],provenance,'test'))['S1'],'Reading Station','without place names the feed is left as published');
});
