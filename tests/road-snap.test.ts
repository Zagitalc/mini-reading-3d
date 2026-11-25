import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {derivedBusDisplayLines,MAX_BUS_DISPLAY_GAP,RoadNetwork,snapLine} from '../scripts/road-snap';
import {distance,lineLength} from '../shared/geo';
import type {LngLat} from '../shared/types';

const roads=RoadNetwork.fromTiles();

test('a long straight gap is replaced by a path along roads', {skip:!roads},()=>{
 // A 435 m stop-to-stop gap that the bundled route 50 shape used to draw as a straight line.
 const a:LngLat=[-0.9768,51.4416],b:LngLat=[-0.9773,51.4377],result=snapLine(roads!,[a,b]);
 assert.equal(result.snapped,1);
 assert.ok(result.line.length>3);
 assert.deepEqual(result.line[0],a);assert.deepEqual(result.line.at(-1),b);
 assert.ok(lineLength(result.line)>=distance(a,b));
 assert.ok(lineLength(result.line)<distance(a,b)*1.7+120);
});

test('gaps outside the road data are left as they were', {skip:!roads},()=>{
 const line:LngLat[]=[[-1.2,51.3],[-1.19,51.31]],result=snapLine(roads!,line);
 assert.deepEqual(result.line,line);assert.equal(result.left,1);
});

test('short gaps are not touched', {skip:!roads},()=>{
 const line:LngLat[]=[[-0.9695,51.4555],[-0.9697,51.4556]];
 assert.deepEqual(snapLine(roads!,line).line,line);
});

test('derived bus overlays look for a road path after clipping a stop outside the map', ()=>{
 const outside:LngLat=[-1.085,51.44],end:LngLat=[-1.074,51.44];
 const boundary:LngLat=[-1.08,51.44],via:LngLat=[-1.077,51.4405];
 assert.deepEqual(derivedBusDisplayLines([outside,end],{route(a,b){
  assert.deepEqual([a,b],[boundary,end]);
  return [via];
 }}),[[boundary,via,end]]);
});

test('derived bus overlays keep the segments on both sides of an unresolved gap', ()=>{
 const before:LngLat[]=[[-.977,51.446],[-.977,51.447]],after:LngLat[]=[[-.977,51.457],[-.977,51.458]];
 assert.deepEqual(derivedBusDisplayLines([...before,...after]),[before,after]);
});

test('published bus routes have no long straight jumps inside the map', ()=>{
 const routes=JSON.parse(readFileSync('public/data/bus-routes.json','utf8')) as {label:string;coordinates:LngLat[][]}[];
 for(const route of routes)for(const line of route.coordinates)for(let i=1;i<line.length;i++)
  assert.ok(distance(line[i-1],line[i])<MAX_BUS_DISPLAY_GAP,`route ${route.label} jumps ${Math.round(distance(line[i-1],line[i]))} m at ${line[i-1]}`);
});
