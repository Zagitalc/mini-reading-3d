import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStyleMin} from '@maplibre/maplibre-gl-style-spec';
import {EMPHASIS,mixHex,resolveTarget} from '../shared/basemap-emphasis';
import {MODE_IDS} from '../shared/modes';
import {CLUSTER_SHARE,clusterGroup} from '../shared/hygiene';
import {mapStyle} from '../src/map/style';
test('mixHex moves linearly between two colours',()=>{
 assert.equal(mixHex('#000000','#ffffff',0),'#000000');assert.equal(mixHex('#000000','#ffffff',1),'#ffffff');
 assert.equal(mixHex('#102030','#305070',.5),'#203850');
});
test('every mode has an emphasis and every target and amount is valid',()=>{
 for(const id of MODE_IDS){const e=EMPHASIS[id];assert.ok(e,id);assert.ok(e.rail>=1&&e.rail<=3,`${id} rail width`);
  for(const [key,m] of Object.entries(e.mix)){assert.ok(m.t>0&&m.t<=1,`${id}.${key} amount`);
   for(const dark of [false,true])assert.match(resolveTarget(m.to,'#112233',dark),/^#[0-9a-f]{6}$/i,`${id}.${key}`);}}
 assert.deepEqual(EMPHASIS.explore.mix,{});assert.deepEqual(EMPHASIS.lab.mix,{},'Everything and Explore keep the plain palette');
});
test('emphasis is real: a mode changes the colours it names and no others',()=>{
 Object.defineProperty(globalThis,'location',{value:{origin:'http://localhost:5174'},configurable:true});
 const paint=(mode:string,dark:boolean,layer:string,prop:string)=>(mapStyle(dark,mode as never).layers.find(l=>l.id===layer)!.paint as Record<string,unknown>)[prop];
 for(const dark of [false,true]){
  assert.notEqual(paint('environment',dark,'water-fill','fill-color'),paint('explore',dark,'water-fill','fill-color'),'Environment strengthens water');
  assert.notEqual(paint('transport',dark,'rail-lines','line-color'),paint('explore',dark,'rail-lines','line-color'),'Transport darkens rail');
  assert.equal(paint('transport',dark,'water-fill','fill-color'),paint('explore',dark,'water-fill','fill-color'),'Transport leaves water alone');
  assert.equal(paint('explore',dark,'rail-lines','line-width'),1);assert.equal(paint('transport',dark,'rail-lines','line-width'),1.8);
 }
});
test('every mode and theme still validates as a map style',()=>{
 Object.defineProperty(globalThis,'location',{value:{origin:'http://localhost:5174'},configurable:true});
 for(const id of MODE_IDS)for(const dark of [false,true])assert.deepEqual(validateStyleMin(mapStyle(dark,id) as never),[],`${id} ${dark?'dark':'light'}`);
});
test('cluster colour bands follow the share rated 4 or 5, and small clusters stay grey',()=>{
 assert.equal(clusterGroup(0,0),'none');assert.equal(clusterGroup(1,2),'none','two rated places say nothing');assert.equal(clusterGroup(3,4),'none');
 assert.equal(clusterGroup(0,5),'poor');
 assert.equal(clusterGroup(17,20),'good','85% is good');assert.equal(clusterGroup(16,20),'fair');
 assert.equal(clusterGroup(14,20),'fair','70% is fair');assert.equal(clusterGroup(13,20),'poor');
 assert.ok(CLUSTER_SHARE.good>CLUSTER_SHARE.fair);
});
