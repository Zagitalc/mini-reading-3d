import test from 'node:test';
import assert from 'node:assert/strict';
import {findDirect,nearbyStops,sharedRoutes,WALK_LIMIT_M} from '../shared/direct-finder';
import type {RouteJourneys} from '../shared/live-departures';
import type {BusStop,StopTimetable} from '../shared/timetable';
const stop=(id:string,lng:number,routeIds:string[]):BusStop=>({id,name:`Stop ${id}`,code:id,position:[lng,51.45],routeIds});
// 0.001 degrees of longitude at this latitude is about 69 m.
const A=stop('A',-0.97,['17']),B=stop('B',-0.96,['17']),C=stop('C',-0.95,['17','21']),D=stop('D',-0.9605,['21']),Z=stop('Z',-0.5,['21']);
test('nearby stops are sorted by walk, capped and limited in distance',()=>{
 const near=nearbyStops([C,A,B,D,Z],[-0.9701,51.45],3);
 assert.deepEqual(near.map(n=>n.stop.id),['A','D','B']);assert.ok(near[0].metres<20);
 assert.ok(near.every(n=>n.metres<=WALK_LIMIT_M));assert.deepEqual(nearbyStops([Z],[-0.97,51.45]),[]);
});
test('only routes calling near both ends are shared',()=>{
 const from=nearbyStops([A,D],[-0.97,51.45]),to=nearbyStops([B,C],[-0.95,51.45],4,2000);
 assert.deepEqual(sharedRoutes(from,to),['17','21']);assert.deepEqual(sharedRoutes(nearbyStops([D],[-0.96,51.45]),nearbyStops([A],[-0.97,51.45])),[]);
});
const now=Date.parse('2026-09-16T09:00:00Z'),at=(h:number,m=0)=>(h*3600+m*60)-3600; // seconds after the service-day origin (23:00Z the day before)
const timetable:StopTimetable={schema:1,stopId:'A',timezone:'Europe/London',services:[{start:'20260901',end:'20260930',weekdays:'1111111',exceptions:{}}],
 trips:[{id:'t1',service:0,routeId:'17',headsign:'Town',direction:'0'},{id:'t2',service:0,routeId:'17',headsign:'Town',direction:'0'},{id:'back',service:0,routeId:'17',headsign:'Depot',direction:'1'}],
 times:[[0,at(11,0)+3600,1,0,0],[1,at(11,30)+3600,1,0,0],[2,at(11,15)+3600,3,0,0]]};
const journeys=new Map<string,RouteJourneys>([['17',{schema:1,version:'x',routeId:'17',timezone:'Europe/London',shapes:[],
 patterns:[{shape:0,stops:['A','B','C'],sequences:[1,2,3],along:[0,1,2]},{shape:0,stops:['C','B','A'],sequences:[1,2,3],along:[0,1,2]}],
 trips:[['t1',0,[0,600,1500]],['t2',0,[0,660,1500]],['back',1,[0,600,1200]]]}]]);
const origin=nearbyStops([A],[-0.97,51.45])[0];
test('lists direct buses in order with ride time, and picks the nearer alighting stop',()=>{
 const to=nearbyStops([B,C],[-0.95,51.45],4,2000),result=findDirect({origins:[{walk:origin,data:timetable}],destinations:to,journeys,now});
 assert.equal(result.length,1);const r=result[0];assert.equal(r.to.stop.id,'C');assert.equal(r.from.stop.id,'A');
 assert.equal(r.departures.length,2);assert.ok(r.departures[0].departs<r.departures[1].departs);assert.equal(r.rideMinutes,25);
 assert.equal(r.departures[0].arrives-r.departures[0].departs,1500*1000);
});
test('a bus that calls at the destination stop before the boarding stop is not direct',()=>{
 // Only the reverse pattern passes B then A, so going from B to A uses journey "back" and never the A, B, C trips.
 const reverse:StopTimetable={...timetable,stopId:'C',times:[[2,at(11,15)+3600,1,0,0]]};
 const c=nearbyStops([C],[-0.95,51.45])[0],a=nearbyStops([A],[-0.97,51.45]);
 assert.equal(findDirect({origins:[{walk:c,data:reverse}],destinations:a,journeys,now}).length,1);
 // Same stop pair the wrong way round: boarding at A for a destination that precedes it in the pattern finds nothing.
 const none=findDirect({origins:[{walk:origin,data:{...timetable,times:[[2,at(11,15)+3600,1,0,0]]}}],destinations:a,journeys,now});
 assert.equal(none.length,0);
});
test('no direct bus when nothing in the window calls at both ends',()=>{
 assert.equal(findDirect({origins:[{walk:origin,data:timetable}],destinations:nearbyStops([D],[-0.9605,51.45]),journeys,now}).length,0);
 assert.equal(findDirect({origins:[{walk:origin,data:timetable}],destinations:nearbyStops([C],[-0.95,51.45]),journeys,now:Date.parse('2026-12-01T09:00Z')}).length,0);
});
test('boarding bays where pickup is not allowed are skipped',()=>{
 const set:StopTimetable={...timetable,times:timetable.times.map(t=>[t[0],t[1],t[2],t[3],1] as typeof t)};
 assert.equal(findDirect({origins:[{walk:origin,data:set}],destinations:nearbyStops([C],[-0.95,51.45]),journeys,now}).length,0);
});
