import test from 'node:test';
import assert from 'node:assert/strict';
import {CLOUD_SLOTS,PUFFS_PER_CLOUD,visibleSlots,viewScale,cloudPuffs,downwind,rainRate,dropCount,sightlineScale,rainCells} from '../src/scene/weather-layout';
test('cloud count follows reported cover rather than a fixed handful',()=>{
 assert.equal(visibleSlots(0),0);assert.equal(visibleSlots(1),CLOUD_SLOTS);
 for(const cover of [.1,.3,.5,.7,.9])assert.ok(Math.abs(visibleSlots(cover)-cover*CLOUD_SLOTS)<=1,`cover ${cover}`);
 let prev=0;for(let c=0;c<=100;c++){const n=visibleSlots(c/100);assert.ok(n>=prev);prev=n;}
 const scale=viewScale(15,51.45,1200,800);assert.equal(cloudPuffs(.5,[0,0],[0,0],scale).length,visibleSlots(.5)*PUFFS_PER_CLOUD);
});
test('clouds keep the same share of the view at every zoom',()=>{
 const far=viewScale(11,51.45,1200,800),near=viewScale(18,51.45,1200,800);
 assert.ok(Math.abs(far.field/near.field-2**7)<1e-6);assert.ok(Math.abs(far.cloudBase/far.u-near.cloudBase/near.u)<1e-9);
 // Camera altitude in MapLibre is about 1.5 view heights times cos(pitch); clouds must stay below it at the steepest pitch.
 assert.ok(near.cloudBase<1.5*near.u*Math.cos(70*Math.PI/180)*.6);
 const puffs=cloudPuffs(1,[.3,.7],[1000,-500],near);for(const p of puffs){assert.ok(Math.abs(p.x-1000)<=near.field*.6);assert.ok(Math.abs(p.y+500)<=near.field*.6);}
});
test('rain is drawn only when precipitation is reported, and more rain means more drops',()=>{
 assert.equal(rainRate(0,900),0);assert.equal(dropCount(0),0);assert.equal(rainRate(.3,900),1.2);
 assert.ok(dropCount(.1)>0);assert.ok(dropCount(4)>dropCount(1));assert.ok(dropCount(1)>dropCount(.1));assert.ok(dropCount(100)<=1500);
});
test('clouds drift downwind of the reported wind direction',()=>{
 const [x,y]=downwind(270);assert.ok(x>.99&&Math.abs(y)<1e-9);const [x2,y2]=downwind(0);assert.ok(y2<-.99&&Math.abs(x2)<1e-9);
});
test('clouds over the place being looked at are shrunk, others keep their size',()=>{
 const u=800,overhead={x:0,y:0,z:160};assert.ok(Math.abs(sightlineScale(overhead,[0,0],0,0,u)-.2)<1e-9);
 // Looking north at 60 degrees, a puff 160 m up sits over a point about 277 m further north.
 const inLine={x:0,y:-277,z:160};assert.ok(sightlineScale(inLine,[0,0],0,60,u)<.25);assert.equal(sightlineScale({x:2000,y:0,z:160},[0,0],0,60,u),1);
});
test('rain falls under the clouds near the view, falling back to any cloud',()=>{
 const cells=[{x:0,y:100},{x:5000,y:0}];assert.deepEqual(rainCells(cells,[0,0],800),[cells[0]]);assert.deepEqual(rainCells([cells[1]],[0,0],800),[cells[1]]);
});
