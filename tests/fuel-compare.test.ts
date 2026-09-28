import {test} from 'node:test';
import assert from 'node:assert/strict';
import {band,detours,litresPer100km,priceRows,spread,tripCost,PRICE_MAX_AGE_MS} from '../shared/fuel-compare';
import type {FuelStation,LngLat} from '../shared/types';
const now=Date.parse('2026-09-28T12:00:00Z');
const station=(id:string,pence:number,position:LngLat=[-0.97,51.45],submittedAt='2026-09-28T08:00:00Z',quiet=false,brand='Test'):FuelStation=>({id,name:id,brand,postcode:'RG1',position,quiet,observedAt:'2026-09-28T09:00:00Z',source:'test',prices:{E10:{pence,submittedAt}}});
test('the spread uses current prices only and prices a 55-litre tank',()=>{
 const old=new Date(now-PRICE_MAX_AGE_MS-3_600_000).toISOString();
 const s=spread([station('a',139.9),station('b',147.9),station('c',142.9),station('stale',120.9,undefined,old),station('quiet',121.9,undefined,undefined,true),station('costco',118.9,undefined,undefined,false,'COSTCO'),station('Reading West Services M4',199.9,undefined,'2026-09-23T08:00:00Z')],'E10',55,now);
 assert.deepEqual(s.current.map(r=>r.id),['a','c','b','Reading West Services M4'],'a five-day-old price still counts');
 assert.equal(s.current[3].motorway,true);
 assert.deepEqual(s.old.map(r=>r.id),['stale','quiet'],'an old or quiet price never counts as the cheapest');
 assert.deepEqual(s.members.map(r=>r.id),['costco'],'members-only fuel is listed apart');
 assert.equal(s.cheapest!.id,'a');assert.equal(s.median,145.4);
 assert.equal(s.savingDearest,33,'60p a litre on 55 litres');assert.equal(s.savingMedian,3.03);
 const plain=spread([station('a',139.9),station('b',147.9),station('c',142.9)],'E10',55,now);
 assert.equal(plain.savingDearest,4.4,'8p a litre on 55 litres is £4.40');assert.equal(plain.savingMedian,1.65);
 assert.equal(band(139.9,142.9),'cheap');assert.equal(band(141.9,142.9),'typical');assert.equal(band(145.9,142.9),'dear');assert.equal(band(1,undefined),'typical');
 assert.equal(s.current[0].submittedAt,'2026-09-28T08:00:00Z');assert.equal(s.current[0].ageHours,4);
 assert.equal(spread([],'E10',55,now).cheapest,undefined);
});
test('a detour is worth it only when the saving beats the fuel burned getting there',()=>{
 assert.ok(Math.abs(litresPer100km(45)-6.277)<.001);
 const home:LngLat=[-0.97,51.45],near=station('near',145.9,[-0.971,51.45]),far=station('far',139.9,[-0.97,51.49]),farther=station('farther',144.9,[-0.97,51.55]);
 const rows=priceRows([near,far,farther],'E10',now).current,{nearest,options}=detours(rows,home,40,45);
 assert.equal(nearest!.row.id,'near');assert.equal(nearest!.netSaving,0);
 const f=options.find(o=>o.row.id==='far')!;
 // About 4.4 km away as the crow flies: 2 × (5.8 − 0.1) road km, roughly 11.4 km extra.
 assert.ok(f.extraKm>11&&f.extraKm<12,String(f.extraKm));
 assert.equal(f.fillCost,55.96);assert.ok(f.detourCost>0.9&&f.detourCost<1.1,String(f.detourCost));
 assert.ok(Math.abs(f.netSaving-(2.4-f.detourCost))<.011);
 assert.equal(options[0].row.id,'far');
 assert.ok(options.find(o=>o.row.id==='farther')!.netSaving<0,'a small saving far away loses money');
 assert.deepEqual(detours([],home,40,45).options,[]);
});
test('car against bus counts fuel both ways plus parking',()=>{
 const t=tripCost({from:[-0.97,51.43],to:[-0.97,51.4557],mpg:45,pence:140,parking:5,busReturn:4.6});
 assert.ok(t.km>7&&t.km<8,String(t.km));
 assert.ok(Math.abs(t.fuel-t.km*litresPer100km(45)/100*1.4)<.01);
 assert.equal(t.car,Math.round((t.fuel+5)*100)/100);assert.equal(t.bus,4.6);
});
