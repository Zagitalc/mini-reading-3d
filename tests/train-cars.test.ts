import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CAR_PITCH,DEFAULT_CARS,MAX_CARS,carCount,carPoses,carsShown} from '../shared/train-cars';
import {alongLine,bearing,distance,fromLocal,lineLength,toLocal} from '../shared/geo';
import {estimateBoard,parseRdmBoard} from '../server/providers/trains';
import {RailNetwork,STATIONS} from '../server/rail-network';
import {VehicleTracker} from '../src/movement/tracker';
import type {LngLat,VehicleObservation} from '../shared/types';

const local=(points:[number,number][])=>points.map(p=>fromLocal(p)) as LngLat[];
const straight=local([[0,0],[500,0]]),arc=(r:number)=>{const pts:[number,number][]=[[-200,0]];for(let a=0;a<=90;a+=3)pts.push([r*Math.sin(a*Math.PI/180),r*(1-Math.cos(a*Math.PI/180))]);pts.push([r,r+200]);return local(pts);},bend=arc(300);

test('carCount accepts a plausible Darwin length and treats 0, missing or odd values as unknown',()=>{
 assert.equal(carCount(8),8);assert.equal(carCount('10'),10);assert.equal(carCount(' 4 '),4);
 for(const v of [0,'0',undefined,null,'',-1,13,2.5,'abc','8 cars',NaN])assert.equal(carCount(v),undefined,String(v));
 assert.equal(carsShown(undefined),DEFAULT_CARS);assert.equal(carsShown(8),8);assert.equal(MAX_CARS,12);
});

test('cars sit one pitch apart behind the lead car on a straight route, all pointing along it',()=>{
 const cars=carPoses(straight,300,4);assert.equal(cars.length,4);
 cars.forEach((c,i)=>{assert.ok(Math.abs(toLocal(c.position)[0]-(300-i*CAR_PITCH))<.5,`car ${i}`);assert.ok(Math.abs(c.bearing-90)<.5);});
 assert.ok(distance(cars[0].position,alongLine(straight,300))<.5);
});

test('on a curve each car points along its own stretch of track, so the train bends',()=>{
 const lead=200+300*Math.PI/2+20,cars=carPoses(bend,lead,8),headings=cars.map(c=>Math.round(c.bearing));
 assert.ok(headings[0]<20||headings[0]>340,'lead car is on the north leg');assert.ok(headings.at(-1)!>15&&headings.at(-1)!<60,'last car is still on the curve');
 assert.ok(new Set(headings).size>=5,'the cars in between turn gradually');
 for(let i=1;i<cars.length;i++)assert.ok(Math.abs(distance(cars[i-1].position,cars[i].position)-CAR_PITCH)<1,`car ${i} stays coupled`);
});

test('cars behind the start of the section carry straight on backwards instead of piling up',()=>{
 const cars=carPoses(straight,10,4);const xs=cars.map(c=>toLocal(c.position)[0]);
 xs.forEach((x,i)=>assert.ok(Math.abs(x-(10-i*CAR_PITCH))<.5,`car ${i} at ${x}`));
 assert.ok(cars.every(c=>Math.abs(c.bearing-90)<.5));
});

test('a train past the end of its section keeps the fallback heading and never returns NaN',()=>{
 const cars=carPoses(straight,900,3,42);for(const c of cars)assert.ok(Number.isFinite(c.bearing)&&Number.isFinite(c.position[0]));
 assert.equal(carPoses(straight,10,0).length,1);assert.equal(carPoses(straight,10,99).length,MAX_CARS);assert.deepEqual(carPoses([straight[0]],5,3),[]);
});

const now=Date.parse('2026-09-16T08:05:00Z');
const rail=new RailNetwork([{properties:{railway:'rail'},geometry:{type:'LineString',coordinates:[STATIONS.RDG,[-.981,51.457],STATIONS.RDW]}}]);
const service=(extra={})=>({serviceID:'t1',serviceType:'train',std:'09:00',etd:'On time',operator:'GWR',destination:[{locationName:'Reading West',crs:'RDW'}],platform:'4',subsequentCallingPoints:[{serviceType:'train',callingPoint:[{crs:'RDW',locationName:'Reading West',st:'09:10',et:'09:12'}]}],...extra});
const observe=(extra={})=>estimateBoard(parseRdmBoard({crs:'RDG',locationName:'Reading',generatedAt:new Date(now).toISOString(),trainServices:[service(extra)]},'RDG'),'RDG',rail,now);

test('the Darwin length becomes the train\'s car count, and 0 or none leaves it unset',()=>{
 assert.equal(observe({length:8}).observations[0].cars,8);assert.equal(observe({length:'4'}).observations[0].cars,4);
 assert.equal('cars' in observe({length:0}).observations[0],false);assert.equal('cars' in observe().observations[0],false);
});

test('a moving train with a known route is posed as several cars, defaulting to three',()=>{
 for(const [length,expected] of [[undefined,3],[0,3],[8,8]] as const){
  const {observations,routes}=observe(length===undefined?{}:{length}),tracker=new VehicleTracker();
  tracker.ingest(observations,now,routes);const pose=tracker.poses(now)[0];
  assert.equal(pose.cars?.length,expected,`length ${length}`);assert.deepEqual(pose.cars![0].position,pose.position);
 }
});

test('buses and trains without a trusted railway section stay a single body',()=>{
 const o=(extra:Partial<VehicleObservation>):VehicleObservation=>({id:'x',kind:'bus',position:[-.97,51.455],observedAt:new Date(now).toISOString(),status:'observed',label:'1',source:'test',...extra});
 const tracker=new VehicleTracker();tracker.ingest([o({}),o({id:'y',kind:'train',cars:8})],now);
 for(const pose of tracker.poses(now))assert.equal(pose.cars,undefined);
});
