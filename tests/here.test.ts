import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestInArea,formatMetres,hereOrder,hereRadius,HERE_GROUPS,nearest} from '../shared/here';
import {MODE_IDS} from '../shared/modes';
import type {LngLat} from '../shared/types';

const origin:LngLat=[-0.9712,51.4545],east=(m:number):LngLat=>[origin[0]+m/69_500,origin[1]];

test('the radius halves with each zoom level and stays between 400 m and 3 km',()=>{
 assert.equal(hereRadius(15),800);assert.equal(hereRadius(14),1600);assert.equal(hereRadius(13),3000);assert.equal(hereRadius(11),3000);
 assert.equal(hereRadius(16),400);assert.equal(hereRadius(19),400);
 for(let z=11;z<19;z+=.5)assert.ok(hereRadius(z)>=hereRadius(z+.5));
});

test('nearest keeps what is inside the radius, closest first, up to the limit',()=>{
 const items=[{id:'far',p:east(900)},{id:'b',p:east(300)},{id:'a',p:east(100)},{id:'c',p:east(500)}];
 const got=nearest(items,i=>i.p,origin,600,2);
 assert.deepEqual(got.map(g=>g.item.id),['a','b']);
 assert.ok(got[0].metres<got[1].metres);
 assert.deepEqual(nearest(items,i=>i.p,origin,50,5),[]);
});

test('every mode orders every group exactly once, with its own groups first',()=>{
 for(const m of MODE_IDS){const order=hereOrder(m);assert.deepEqual([...order].sort(),[...HERE_GROUPS].sort(),m);}
 assert.equal(hereOrder('transport')[0],'stops');assert.equal(hereOrder('environment')[0],'flood');
});

test('the nearest point of an area is the point itself inside it, ignores holes, and is on the edge outside',()=>{
 const sq=(c:LngLat,half:number):LngLat[]=>[[c[0]-half,c[1]-half],[c[0]+half,c[1]-half],[c[0]+half,c[1]+half],[c[0]-half,c[1]+half],[c[0]-half,c[1]-half]];
 const area={type:'MultiPolygon' as const,coordinates:[[sq(origin,.005),sq(origin,.001)]]};
 const inside=nearestInArea([origin[0]+.003,origin[1]],area);assert.equal(inside.metres,0);assert.deepEqual(inside.position,[origin[0]+.003,origin[1]]);
 const inHole=nearestInArea(origin,area);assert.ok(inHole.metres>0&&inHole.metres<200,String(inHole.metres));
 const outside=nearestInArea([origin[0]+.006,origin[1]],area);assert.ok(outside.metres>50&&outside.metres<100,String(outside.metres));
 assert.ok(Math.abs(outside.position[0]-(origin[0]+.005))<1e-6);
 assert.equal(nearestInArea(origin,{type:'MultiPolygon',coordinates:[]}).metres,Infinity);
});

test('distances read plainly',()=>{
 assert.equal(formatMetres(4),'10\u00a0m');assert.equal(formatMetres(123),'120\u00a0m');assert.equal(formatMetres(949),'950\u00a0m');assert.equal(formatMetres(1450),'1.4\u00a0km');
});
