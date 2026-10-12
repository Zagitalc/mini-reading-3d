import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estimateBoard,parseRdmBoard,standingPlace,standingUntil} from '../server/providers/trains';
import {RailNetwork,STATIONS} from '../server/rail-network';
import {READING_PLATFORMS} from '../shared/reading-platforms';
import {derivePlatformStops} from '../shared/station-platforms';
import {STATION_PLATFORMS,type LandmarkComponent} from '../shared/landmark-components';
import {distance,nearestOnLine} from '../shared/geo';
import {CAR_PITCH} from '../shared/train-cars';
import {VehicleTracker} from '../src/movement/tracker';
import {readFileSync} from 'node:fs';

const now=Date.parse('2026-10-12T08:05:00Z'); // 09:05 in London
const rail=new RailNetwork([{properties:{railway:'rail'},geometry:{type:'LineString',coordinates:[STATIONS.RDG,[-.981,51.457],STATIONS.RDW]}}]);
const board=(services:unknown[])=>({crs:'RDG',locationName:'Reading',generatedAt:new Date(now).toISOString(),trainServices:services});
const observe=(service:object,at=now)=>estimateBoard(parseRdmBoard(board([service]),'RDG'),'RDG',rail,at);
// Starts at Reading: only a departure time, then a call at Reading West.
const starts=(extra={})=>({serviceID:'starts',serviceType:'train',std:'09:09',etd:'On time',operator:'GWR',platform:'10',length:'8',destination:[{locationName:'London Paddington',crs:'PAD'}],subsequentCallingPoints:[{serviceType:'train',callingPoint:[{crs:'RDW',locationName:'Reading West',st:'09:20',et:'On time'}]}],...extra});
// Ends at Reading: only an arrival time.
const ends=(extra={})=>({serviceID:'ends',serviceType:'train',sta:'09:03',eta:'On time',operator:'GWR',platform:'7',destination:[{locationName:'Reading',crs:'RDG'}],previousCallingPoints:[{serviceType:'train',callingPoint:[{crs:'RDW',locationName:'Reading West',st:'08:50',et:'On time'}]}],...extra});

test('standingUntil: a train that starts here waits at its platform for the last six minutes, once a platform is shown',()=>{
 const dep=now+4*60000;
 assert.equal(standingUntil(null,dep,now,true,true),dep);
 assert.equal(standingUntil(null,now+7*60000,now,true,true),null,'too early');
 assert.equal(standingUntil(null,dep,now,false,true),null,'no platform yet');
 assert.equal(standingUntil(null,now-1,now,true,true),null,'already left');
});

test('standingUntil: a train that ends here stands for four minutes after it arrives; a delayed through train is not guessed at',()=>{
 assert.equal(standingUntil(now-60000,null,now,true,false),now-60000+4*60000);
 assert.equal(standingUntil(now-5*60000,null,now,true,false),null,'emptied and gone');
 assert.equal(standingUntil(now-60000,null,now,true,true),null,'continues, departure unknown');
 assert.equal(standingUntil(now+60000,null,now,true,false),null,'not arrived');
 assert.equal(standingUntil(now-60000,now+60000,now,true,true),now+60000,'through train between arrival and departure, as before');
});

test('a train that starts at Reading is on its platform before it leaves, with its destination and no earlier stop',()=>{
 const {observations,routes}=observe(starts());
 assert.equal(observations.length,1);const o=observations[0];
 assert.equal(o.stopUntil,'2026-10-12T08:09:00.000Z');assert.equal(o.destination,'London Paddington');assert.equal(o.cars,8);
 assert.deepEqual(o.nextStop,{name:'Reading',at:'2026-10-12T08:09:00.000Z',dwell:true,scheduled:'09:09',platform:'10'});
 const stop=READING_PLATFORMS['10'];assert.equal(o.bearing,stop.bearing);assert.equal(o.tripId,'starts');
 assert.equal(routes.starts.length,2);assert.ok(nearestOnLine(o.position,routes.starts).distance<1,'position is on the platform axis');
});

test('a train that ends at Reading stands at its platform without a departure, then disappears',()=>{
 const o=observe(ends()).observations[0];
 assert.equal(o.stopUntil,'2026-10-12T08:07:00.000Z');assert.equal('nextStop' in o,false);assert.equal(o.bearing,READING_PLATFORMS['7'].bearing);
 assert.equal(observe(ends(),now+3*60000).observations.length,0);
});

test('without a platform in the table the train stands at the station point with no heading or route; with no platform shown yet it is not drawn',()=>{
 assert.equal(observe(starts({platform:undefined})).observations.length,0);
 for(const platform of ['4A','16']){
  const {observations,routes}=observe(starts({platform}));
  assert.deepEqual(observations[0].position,STATIONS.RDG,String(platform));assert.equal(observations[0].bearing,undefined);assert.deepEqual(routes,{});
 }
 const elsewhere=estimateBoard(parseRdmBoard({...board([starts({platform:'10'})]),crs:'TLH'},'TLH'),'TLH',rail,now);
 assert.deepEqual(elsewhere.observations[0].position,STATIONS.TLH);assert.deepEqual(elsewhere.routes,{});
});

test('the whole train is centred on the platform and cars line up along it',()=>{
 const routes:Record<string,[number,number][]>={};
 for(const [cars,platform,expectedShift] of [[undefined,'10',CAR_PITCH],[8,'10',CAR_PITCH*3.5],[12,'10',CAR_PITCH*5.5],[12,'1',READING_PLATFORMS['1'].length/2]] as const){
  const place=standingPlace('RDG',platform,cars,'x',routes);const route=routes.x,mid=[(route[0][0]+route[1][0])/2,(route[0][1]+route[1][1])/2] as [number,number];
  assert.ok(Math.abs(distance(place.position,mid)-expectedShift)<.5,`${cars} cars shifted ${distance(place.position,mid)}`);
 }
 const observed=observe(starts()),tracker=new VehicleTracker();tracker.ingest(observed.observations,now,observed.routes);
 const pose=tracker.poses(now)[0];assert.equal(pose.cars?.length,8);assert.deepEqual(pose.position,observed.observations[0].position);
 const stop=READING_PLATFORMS['10'];
 for(const car of pose.cars!)assert.ok(Math.abs(car.bearing-stop.bearing)<.5,'cars point along the platform');
});

test('every Reading platform has a stop on the map, and the table matches the platform footprints',()=>{
 const {components}=JSON.parse(readFileSync('public/data/landmark-components.json','utf8')) as {components:LandmarkComponent[]};
 const derived=derivePlatformStops(components.filter(c=>STATION_PLATFORMS.includes(c.id)));
 assert.deepEqual(READING_PLATFORMS,derived,'run: node --import tsx scripts/derive-platform-stops.ts');
 assert.deepEqual(Object.keys(READING_PLATFORMS).sort((a,b)=>+a-+b),Array.from({length:15},(_,i)=>String(i+1)));
 for(const [ref,stop] of Object.entries(READING_PLATFORMS)){
  assert.ok(distance(stop.position,STATIONS.RDG)<500,`platform ${ref} is at the station`);assert.ok(stop.length>80&&stop.length<400,`platform ${ref} length ${stop.length}`);assert.ok(stop.bearing>=0&&stop.bearing<180);
 }
});
