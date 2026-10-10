import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RoadNetwork,snapLine} from '../scripts/road-snap';
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

test('published bus routes have no long straight jumps inside the map', ()=>{
 const routes=JSON.parse(readFileSync('public/data/bus-routes.json','utf8')) as {label:string;coordinates:LngLat[][]}[];
 for(const route of routes)for(const line of route.coordinates)for(let i=1;i<line.length;i++)
  assert.ok(distance(line[i-1],line[i])<350,`route ${route.label} jumps ${Math.round(distance(line[i-1],line[i]))} m at ${line[i-1]}`);
});
