import test from 'node:test';import assert from 'node:assert/strict';
import{matchBusRoute,type BusNetwork}from'../server/route-matcher';
import{VehicleTracker}from'../src/movement/tracker';
import{VehicleMeshes}from'../src/scene/vehicles';
import{fromLocal,toLocal,distance,nearestOnLine}from'../shared/geo';
import{timetableStatus,type StopIndex}from'../shared/timetable';
import{gtfsContentHash,validateGtfs}from'../scripts/gtfs-validation';
import type{VehicleObservation,LngLat}from'../shared/types';
import*as T from'three';
const now=Date.parse('2026-09-26T10:00:00Z');
const p=(x:number,y:number):LngLat=>fromLocal([x,y]);
const bus=(x:number,y:number,extra:Partial<VehicleObservation>={}):VehicleObservation=>({id:'bus:1',kind:'bus',label:'17',operatorId:'RBUS',tripId:'reported-trip',position:p(x,y),bearing:90,observedAt:new Date(now).toISOString(),status:'observed',source:'test',...extra});
const net=(lines:Record<string,LngLat[]>):BusNetwork=>({shapes:lines,trips:Object.keys(lines).map((id,i)=>({trip_id:`gtfs-${i}`,route_id:'RBUS:17',shape_id:id})),routes:[{route_id:'RBUS:17',route_short_name:'17'}]});
test('direction separates opposing shapes and preserves raw journey identity',()=>{
 const line=[p(0,0),p(200,0)],n=net({east:line,west:[...line].reverse()});
 const east=matchBusRoute(bus(100,2),n);assert.equal(east.observation.tripId,'shape:east');assert.equal(east.observation.journeyRef,'reported-trip');
 assert.equal(matchBusRoute(bus(100,2,{bearing:270}),n).observation.tripId,'shape:west');
 assert.equal(matchBusRoute(bus(100,2,{bearing:undefined}),n).route,undefined);
});
test('branch ambiguity exposes only shared geometry and never invents the future branch',()=>{
 const n=net({north:[p(0,0),p(100,0),p(100,100)],south:[p(0,0),p(100,0),p(100,-100)]});
 const result=matchBusRoute(bus(50,1),n);assert.equal(result.observation.routeMatch,'shared');assert.ok(result.route);
 for(const point of result.route!)assert.ok(Math.abs(toLocal(point)[1])<1);
 const off=matchBusRoute(bus(50,70),n);assert.equal(off.route,undefined);
});
test('recent observations disambiguate branches; wrong journeys cannot supply continuity',()=>{
 const n=net({a:[p(0,0),p(100,0),p(200,0)],b:[p(0,100),p(100,0),p(200,0)]});
 const previous=bus(20,0,{observedAt:new Date(now-60000).toISOString()});
 assert.equal(matchBusRoute(bus(150,0),n,previous).observation.tripId,'shape:a');
 assert.equal(matchBusRoute(bus(150,0,{tripId:'new-journey'}),n,previous).observation.routeMatch,'shared');
});
test('matched motion follows a bend, aligns its heading, and starts on the route immediately',()=>{
 const route=[p(0,0),p(100,0),p(100,100)],tracker=new VehicleTracker();
 tracker.ingest([bus(20,3,{tripId:'shape'})],now,{shape:route});
 assert.ok(distance(tracker.poses(now)[0].position,p(20,0))<.01);assert.ok(Math.abs(tracker.poses(now)[0].bearing-90)<1);
 tracker.ingest([bus(102,80,{tripId:'shape',bearing:0,observedAt:new Date(now+60000).toISOString()})],now+60000,{shape:route});
 for(let elapsed=0;elapsed<=60000;elapsed+=1000)assert.ok(nearestOnLine(tracker.poses(now+60000+elapsed)[0].position,route).distance<.01);
 const end=tracker.poses(now+120000)[0];assert.ok(distance(end.position,p(100,80))<.01);assert.ok(Math.abs(end.bearing)<1);
});
test('unmatched buses hold observations and journey changes do not tween across the map',()=>{
 const tracker=new VehicleTracker();tracker.ingest([bus(0,0)],now);tracker.ingest([bus(100,100,{observedAt:new Date(now+60000).toISOString()})],now+60000);
 assert.deepEqual(tracker.poses(now+60001)[0].position,p(100,100));
 const route=[p(0,0),p(200,0)];tracker.ingest([bus(20,0,{tripId:'shape',journeyRef:'new',observedAt:new Date(now+120000).toISOString()})],now+120000,{shape:route});assert.ok(distance(tracker.poses(now+120001)[0].position,p(20,0))<.01);
});
test('rendered bus front points north, east, south and west with its heading',()=>{
 const meshes=new VehicleMeshes();for(const heading of [0,90,180,270]){meshes.update([{observation:bus(0,0),position:p(0,0),bearing:heading,stale:false}],17);
 const front=meshes.parts.find(p=>p.kind==='bus'&&p.offset[1]>5)!;const matrix=new T.Matrix4();front.mesh.getMatrixAt(0,matrix);const pos=new T.Vector3().setFromMatrixPosition(matrix);assert.ok(Math.abs(pos.x-Math.sin(heading*Math.PI/180)*5.28)<.01);assert.ok(Math.abs(pos.y-Math.cos(heading*Math.PI/180)*5.28)<.01);}
 for(const part of meshes.parts){part.mesh.geometry.dispose();(part.mesh.material as T.Material).dispose();}
});
test('timetable warns before expiry and expires at London midnight',()=>{
 const index={validFrom:'20260919',validUntil:'20261002',timezone:'Europe/London'};
 assert.equal(timetableStatus(index,Date.parse('2026-09-26T12:00Z')).state,'current');assert.equal(timetableStatus(index,Date.parse('2026-09-29T12:00Z')).state,'expiring');assert.equal(timetableStatus(index,Date.parse('2026-10-02T23:01Z')).state,'expired');assert.equal(timetableStatus(index,Date.parse('2026-09-18T12:00Z')).state,'future');
});
test('GTFS content fingerprints ignore ZIP metadata and file insertion order but detect changed text',()=>{
 const text=(s:string)=>new TextEncoder().encode(s);assert.equal(gtfsContentHash({'b.txt':text('two'),'a.txt':text('one')}),gtfsContentHash({'a.txt':text('one'),'b.txt':text('two'),'image.png':text('ignore')}));assert.notEqual(gtfsContentHash({'a.txt':text('one')}),gtfsContentHash({'a.txt':text('changed')}));
});
test('refresh validation rejects expired, future and catastrophically reduced coverage',()=>{
 const index={validFrom:'20260901',validUntil:'20260918',stops:[],routes:{}} as unknown as StopIndex;
 assert.throws(()=>validateGtfs(net({}),index,new Map(),undefined,now),/expired/);
 assert.throws(()=>validateGtfs(net({}),{...index,validFrom:'20261001',validUntil:'20261025'},new Map(),undefined,now),/does not start/);
 assert.throws(()=>validateGtfs(net({}),{...index,validUntil:'20261025'},new Map(),undefined,now),/coverage unexpectedly small/);
});
