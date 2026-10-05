import test from 'node:test';
import assert from 'node:assert/strict';
import {fuelFact,summarise,type Facts} from '../shared/summary';
import {MODE_IDS} from '../shared/modes';
import type {FuelStation} from '../shared/types';

const now=Date.parse('2026-10-05T12:00:00Z'),iso=(minutesAgo:number)=>new Date(now-minutesAgo*60_000).toISOString();
const text=(mode:Parameters<typeof summarise>[0],facts:Facts)=>summarise(mode,facts,now).lines.map(l=>`${l.label}: ${l.text}${l.note?` [${l.note}]`:''}`).join('\n');
const station=(id:string,name:string,pence:number):FuelStation=>({id,name,brand:name,position:[-.97,51.45],postcode:'RG1',quiet:false,prices:{E10:{pence,submittedAt:iso(120)}},observedAt:iso(30),source:'fixture'}) as FuelStation;

test('every mode has a card, and a card with no data says so instead of showing zeros',()=>{
 for(const id of MODE_IDS)assert.ok(summarise(id,{},now).title,id);
 assert.match(text('transport',{}),/Waiting for the first positions/);
 assert.match(text('transport',{vehicles:null}),/unavailable/);
 assert.match(text('drive',{}),/Fuel: No prices loaded/);
 assert.match(text('eat',{}),/Loading hygiene ratings/);
 assert.doesNotMatch(text('transport',{}),/\b0 buses\b/);
});

test('Transport reports buses, routes, estimated trains and roadworks',()=>{
 const t=text('transport',{vehicles:{buses:132,busRoutes:18,trains:6,at:now-60_000},roadworks:{active:7,closures:2,at:now-120_000}});
 assert.match(t,/Buses: 132 buses on 18 routes/);assert.match(t,/Trains: 6 trains, positions estimated/);assert.match(t,/7 active roadworks, 2 closures among them/);
 assert.match(text('transport',{vehicles:{buses:1,busRoutes:1,trains:0,at:now},roadworks:{active:0,closures:0,at:now}}),/1 bus on 1 route[\s\S]*No active roadworks/);
});

test('a figure that has stopped updating is flagged with its last reading time',()=>{
 const old=summarise('transport',{vehicles:{buses:10,busRoutes:4,trains:0,at:now-20*60_000}},now).lines[0];
 assert.equal(old.stale,true);assert.match(old.note!,/^last reading \d\d:\d\d$/);
 assert.equal(summarise('transport',{vehicles:{buses:10,busRoutes:4,trains:0,at:now-60_000}},now).lines[0].stale,false);
});

test('Drive shows the cheapest E10, the cheapest without a membership when that is Costco, and the middle price',()=>{
 const stations=[station('c','Costco Reading',129.9),station('t','Tesco Napier Road',132.9),station('b','BP Oxford Road',137.9)];
 const fact=fuelFact(stations,now)!;
 assert.equal(fact.cheapest?.name,'Costco Reading');assert.equal(fact.cheapest?.membersOnly,true);assert.equal(fact.cheapestOpen?.name,'Tesco Napier Road');assert.equal(fact.median,132.9);
 const t=text('drive',{fuel:fact});
 assert.match(t,/Cheapest E10: Costco Reading 129\.9p \(members only\)/);assert.match(t,/Without membership: Tesco Napier Road 132\.9p/);assert.match(t,/Middle price: 132\.9p across 3 forecourts/);
 const open=fuelFact([station('t','Tesco Napier Road',132.9)],now)!;assert.equal(open.cheapestOpen,undefined);
 assert.equal(fuelFact([],now),undefined);
});

test('forecourt prices older than a week are not offered as the cheapest',()=>{
 const stale={...station('o','Old Garage',99.9),prices:{E10:{pence:99.9,submittedAt:iso(60*24*10)}}} as FuelStation;
 const fact=fuelFact([stale,station('t','Tesco Napier Road',132.9)],now)!;assert.equal(fact.cheapest?.name,'Tesco Napier Road');assert.equal(fact.count,1);
});

test('Environment separates gauges outside their typical range and never counts unknown ones as normal',()=>{
 const rivers={gauges:9,high:['Theale'],low:[],normal:7,unknown:1,warnings:{severe:0,warning:0,alert:0},warningsKnown:true,at:now-600_000};
 const t=text('environment',{rivers,weather:{temperature:13.4,cloudCover:80,precipitation:'rain',at:now-600_000}});
 assert.match(t,/Weather: 13°C, rain \(modelled, not measured here\)/);assert.match(t,/Flood warnings: None in force/);
 assert.match(t,/9 river gauges: 7 within typical range, 1 above, 1 with no typical range/);assert.match(t,/Above typical range: Theale/);
 assert.match(text('environment',{rivers:{...rivers,warnings:{severe:1,warning:0,alert:2}}}),/1 severe flood warning, 2 flood alerts in force/);
 assert.match(text('environment',{rivers:{...rivers,warningsKnown:false}}),/Could not be checked/);
});

test('Food counts premises by type, and says the rating is hygiene only',()=>{
 const t=text('eat',{food:{total:980,restaurant:425,takeaway:217,pub:148,rated5:577,authorityDate:'1 October 2026'}});
 assert.match(t,/980 places to eat or drink/);assert.match(t,/425 restaurants and cafés, 217 takeaways, 148 pubs and bars/);assert.match(t,/Hygiene rating 5: 577 of 980 \(hygiene only, not food quality\)/);
});

test('Explore names the nearest landmark, in metres or kilometres',()=>{
 const base={buildings:97399,landmarks:6};
 assert.match(text('explore',{explore:{...base,nearest:{name:'The Oracle',metres:312}}}),/Nearest landmark: The Oracle, 310 m from the middle of the map/);
 assert.match(text('explore',{explore:{...base,nearest:{name:'University of Reading',metres:2350}}}),/2\.4 km/);
});

test('Everything shows one or two lines from each part, and a search button only where a search fits',()=>{
 const facts:Facts={vehicles:{buses:3,busRoutes:2,trains:1,at:now},roadworks:{active:1,closures:0,at:now},food:{total:980,restaurant:1,takeaway:1,pub:1,rated5:5,authorityDate:'x'}};
 const labels=summarise('lab',facts,now).lines.map(l=>l.label);
 assert.ok(labels.includes('Buses')&&labels.includes('Roadworks')&&labels.includes('Premises'));assert.ok(!labels.includes('Trains'));
 assert.equal(summarise('lab',facts,now).action,undefined);assert.ok(summarise('transport',facts,now).action);
});
