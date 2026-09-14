import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseWeather} from '../server/providers/weather';
import {parseFuel} from '../server/providers/fuel';
import {TrafficTiles,memoryTileCache,validTrafficTile} from '../server/providers/tomtom';
import {matchBusRoute,type BusNetwork} from '../server/route-matcher';
import {CADENCE,due,retryDelay} from '../shared/feed-policy';
import type {VehicleObservation} from '../shared/types';
const now=Date.parse('2026-09-14T12:00:00Z');
test('weather preserves interval and model time; rejects stale or malformed conditions',()=>{
 const input={current:{time:now/1000,interval:900,temperature_2m:15,cloud_cover:80,rain:.2,showers:.1,snowfall:0,weather_code:61,wind_speed_10m:12,wind_direction_10m:180,is_day:1}};
 const w=parseWeather(input,now);assert.ok(Math.abs(w.rainMm*3600/w.intervalSeconds-1.2)<1e-8);assert.equal(w.observedAt,'2026-09-14T12:00:00.000Z');assert.throws(()=>parseWeather(input,now+3600001));assert.throws(()=>parseWeather({current:{...input.current,cloud_cover:200}},now));
});
test('fuel preserves grade timestamps, excludes approximate locations and stale snapshots',()=>{
 const s={id:'one',name:'Reading fuel',brand:'Example',postcode:'RG1',lat:51.455,lon:-.97,site_quiet:true,prices:{E10:{pence_per_litre:140.9,submitted_at:'2026-09-01T12:00:00Z'}}};
 const input={source_generated_at:'2026-09-14T11:00:00Z',stations:[s,{...s,id:'approx',location_repaired:'district_centre'},{...s,id:'outside',lat:52},{...s,id:'invalid',prices:{E10:{pence_per_litre:0}}}]};
 const out=parseFuel(input,now);assert.equal(out.length,1);assert.equal(out[0].prices.E10.pence,140.9);assert.equal(out[0].prices.E10.submittedAt,'2026-09-01T12:00:00Z');assert.equal(out[0].quiet,true);assert.throws(()=>parseFuel(input,now+49*3600000));
});
test('traffic coalesces requests, caches successful tiles, and rejects out-of-area requests without a provider call',async()=>{
 const original=globalThis.fetch;let calls=0,reservations=0;let release:()=>void=()=>{};
 globalThis.fetch=async()=>{calls++;await new Promise<void>(r=>release=r);return new Response(new Uint8Array([1,2,3]));};
 try{const service=new TrafficTiles(memoryTileCache(),async()=>{reservations++;return true;});const z=12,x=2036,y=1362;assert.equal(validTrafficTile(z,x,y),true);
 const a=service.get('fixture',z,x,y),b=service.get('fixture',z,x,y);await new Promise(r=>setTimeout(r,5));assert.equal(calls,1);release();assert.equal((await a).status,200);assert.equal((await b).status,200);assert.equal((await service.get('fixture',z,x,y)).status,200);assert.equal(calls,1);assert.equal(reservations,1);assert.equal((await service.get('fixture',12,0,0)).status,404);assert.equal(calls,1);
 const limited=new TrafficTiles(memoryTileCache(),async()=>false);assert.equal((await limited.get('fixture',z,x,y)).status,429);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('bus branding matches its line even when the exact journey shape is ambiguous; other operators do not inherit it',()=>{
 const n:BusNetwork={routes:[{route_id:'RBUS:17',route_short_name:'17'}],trips:[{trip_id:'a',route_id:'RBUS:17',shape_id:'a'},{trip_id:'b',route_id:'RBUS:17',shape_id:'b'}],shapes:{a:[[-.98,51.455],[-.96,51.455]],b:[[-.98,51.455],[-.96,51.455]]}};
 const o:VehicleObservation={id:'bus',operatorId:'RBUS',kind:'bus',position:[-.97,51.455],label:'17',bearing:90,observedAt:new Date(now).toISOString(),source:'fixture',status:'observed'};
 const result=matchBusRoute(o,n);assert.equal(result.observation.routeGroupId,'RBUS:17');assert.equal(result.observation.routeColour,'#784699');assert.ok(result.route,'duplicate timetable shapes should not defeat matching');assert.equal(matchBusRoute({...o,operatorId:'OTHER'},n).observation.routeGroupId,undefined);
 const off=matchBusRoute({...o,position:[-1.05,51.49]},n);assert.equal(off.route,undefined);assert.deepEqual(off.observation.position,[-1.05,51.49]);
});
test('provider schedules skip early calls and slow providers never retry at a faster cadence',()=>{
 assert.equal(due(new Date(now).toISOString(),CADENCE.weather,0,now+60000),false);assert.equal(due(new Date(now).toISOString(),CADENCE.weather,0,now+900000),true);assert.equal(retryDelay(CADENCE.fuel,1),12*3600000);assert.equal(due(new Date(now).toISOString(),CADENCE.buses,2,now+60000),false);
});
