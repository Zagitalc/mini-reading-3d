import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {SKYLINE,SKYLINE_TILE_IDS,isSkylineBuilding} from '../shared/skyline';
import {distance} from '../shared/geo';
import type {Building} from '../shared/types';

const chunks=new Map<string,Building>();
for(const file of readdirSync('public/data/chunks'))for(const b of JSON.parse(readFileSync(`public/data/chunks/${file}`,'utf8')) as Building[])chunks.set(b.id,b);

test('each skyline footprint is the bundled building it names', ()=>{
 for(const l of SKYLINE){
  const b=chunks.get(`${l.buildingId}/0`);assert.ok(b,`${l.name}: ${l.buildingId} is not in the building chunks`);
  assert.deepEqual(b.rings[0],l.ring,`${l.name}: footprint differs from the chunk`);
 }
});

test('skyline models have sensible heights and say where they came from', ()=>{
 for(const l of SKYLINE){
  assert.ok(l.height>5&&l.height<100,l.name);
  if(l.top)assert.ok(l.top>l.height,`${l.name}: top is below the roof`);
  assert.ok(l.source.length>20,l.name);
  if(l.heightSource==='cited')assert.match(l.source,/wikipedia/i,`${l.name}: cited height needs a named source`);
 }
});

test('skyline buildings are recognised by chunk id and listed for the tile filter', ()=>{
 assert.ok(isSkylineBuilding('area/65505346/0'));assert.ok(isSkylineBuilding('area/65505346/2'));assert.ok(!isSkylineBuilding('area/65505347/0'));
 assert.equal(SKYLINE_TILE_IDS.length,SKYLINE.length*4);
 assert.ok(SKYLINE_TILE_IDS.includes('area/96032369/0'));
});

test('skyline footprints sit where the cited coordinates say', ()=>{
 const expected:Record<string,[number,number]>={blade:[-0.96643,51.45556],'thames-tower':[-0.97274,51.45796],minster:[-0.9736,51.4544],'st-laurence':[-0.9693,51.4564]};
 for(const l of SKYLINE){const ring=l.ring,c:[number,number]=[ring.reduce((s,p)=>s+p[0],0)/ring.length,ring.reduce((s,p)=>s+p[1],0)/ring.length];assert.ok(distance(c,expected[l.id])<30,`${l.name} is ${Math.round(distance(c,expected[l.id]))} m from its cited position`);}
});
