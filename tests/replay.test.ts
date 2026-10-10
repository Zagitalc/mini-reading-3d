import test from 'node:test';
import assert from 'node:assert/strict';
import {ReplayBuffer,replayLength,REPLAY_MAX_FRAMES,REPLAY_MIN_GAP,REPLAY_WINDOW} from '../shared/replay';
import {ReplayPlayer} from '../src/movement/replay-player';
import {distance} from '../shared/geo';
import type {LngLat,VehicleObservation} from '../shared/types';

const T0=Date.parse('2026-10-10T12:00:00Z');
const START:LngLat=[-0.97,51.45],metresEast=(m:number):LngLat=>[START[0]+m/69500,START[1]];
const route:LngLat[]=[START,metresEast(2000)];
const bus=(id:string,metres:number,at:number,extra:Partial<VehicleObservation>={}):VehicleObservation=>({id,kind:'bus',position:metresEast(metres),observedAt:new Date(at).toISOString(),label:'17',tripId:`trip-${id}`,status:'observed',source:'test',...extra} as VehicleObservation);

test('the buffer keeps snapshots in order and ignores ones that arrive too close together',()=>{
 const b=new ReplayBuffer();
 assert.equal(b.span,undefined);assert.equal(b.ready,false);
 assert.ok(b.push([],T0));assert.equal(b.push([],T0+REPLAY_MIN_GAP-1),false);assert.ok(b.push([],T0+60_000));
 assert.equal(b.frames.length,2);assert.equal(b.ready,true);
 assert.deepEqual(b.span,{from:T0,to:T0+60_000,count:2});
 assert.equal(b.indexAt(T0-1),-1);assert.equal(b.indexAt(T0),0);assert.equal(b.indexAt(T0+59_999),0);assert.equal(b.indexAt(T0+60_000),1);assert.equal(b.indexAt(T0+9e9),1);
});

test('only the last hour is kept, and memory is capped',()=>{
 const b=new ReplayBuffer();
 for(let i=0;i<=80;i++)b.push([],T0+i*60_000);
 assert.ok(b.span!.to-b.span!.from<=REPLAY_WINDOW);assert.equal(b.frames.length,61);
 const many=new ReplayBuffer();for(let i=0;i<REPLAY_MAX_FRAMES+50;i++)many.push([],T0+i*REPLAY_MIN_GAP);
 assert.equal(many.frames.length,REPLAY_MAX_FRAMES);
});

test('journey shapes are kept only for vehicles in the buffer',()=>{
 const b=new ReplayBuffer();
 b.push([bus('a',0,T0)],T0,{'trip-a':route,'trip-other':route});
 assert.deepEqual(Object.keys(b.routes),['trip-a']);
});

test('replay lengths read naturally',()=>{
 assert.equal(replayLength(20_000),'under a minute');assert.equal(replayLength(60_000),'1 minute');assert.equal(replayLength(23*60_000),'23 minutes');
});

test('a replayed bus moves along its route between two snapshots',()=>{
 const b=new ReplayBuffer();
 b.push([bus('a',0,T0)],T0,{'trip-a':route});b.push([bus('a',600,T0+60_000)],T0+60_000,{'trip-a':route});
 const p=new ReplayPlayer(b);
 assert.deepEqual(p.poses(T0-1),[]);
 const first=p.poses(T0+1);assert.equal(first.length,1);assert.ok(distance(first[0].position,metresEast(0))<5);
 const half=p.poses(T0+60_000+30_000);assert.equal(half.length,1);
 assert.ok(Math.abs(distance(half[0].position,START)-300)<8,`expected about 300 m along, got ${distance(half[0].position,START)}`);
 const end=p.poses(T0+60_000+60_000);assert.ok(Math.abs(distance(end[0].position,START)-600)<8);
});

test('scrubbing back plays the earlier position again and a vehicle appears only once seen',()=>{
 const b=new ReplayBuffer();
 b.push([bus('a',0,T0)],T0,{'trip-a':route});b.push([bus('a',600,T0+60_000),bus('b',1000,T0+60_000)],T0+60_000,{'trip-a':route,'trip-b':route});
 const p=new ReplayPlayer(b);
 assert.equal(p.poses(T0+90_000).length,2);
 const back=p.poses(T0+5_000);assert.equal(back.length,1);assert.equal(back[0].observation.id,'a');assert.ok(distance(back[0].position,START)<5);
 assert.equal(p.poses(T0+70_000).length,2);
});

test('a player survives its first snapshot leaving the buffer',()=>{
 const b=new ReplayBuffer();
 b.push([bus('a',0,T0)],T0,{'trip-a':route});b.push([bus('a',100,T0+60_000)],T0+60_000,{'trip-a':route});
 const p=new ReplayPlayer(b);p.poses(T0+60_000);
 b.push([bus('a',200,T0+REPLAY_WINDOW+120_000)],T0+REPLAY_WINDOW+120_000,{'trip-a':route});
 assert.ok(b.frames[0].at>T0);
 assert.doesNotThrow(()=>p.poses(b.span!.to));
});
