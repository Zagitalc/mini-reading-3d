import test from 'node:test';
import assert from 'node:assert/strict';
import {countdown,delayLabel,liveDepartures,liveKey,runsJourney,stopDistances,type RouteJourneys} from '../shared/live-departures';
import {serviceOrigin,type Departure} from '../shared/timetable';
import {compileTimetable} from '../scripts/compile-timetable';
import {withTimetableTrips} from '../server/providers/buses';
import {parseVehicleTrips} from '../server/providers/gtfs-rt';
import type {LngLat,VehicleObservation} from '../shared/types';

// A straight road running east from the town centre; about 69 m per 0.001° of longitude at Reading.
const road:LngLat[]=[[-0.98,51.455],[-0.96,51.455]];
const at=(fraction:number):LngLat=>[-0.98+0.02*fraction,51.455];
const date='20261002',origin=serviceOrigin(date);
const h=(hours:number,minutes=0)=>hours*3600+minutes*60;
// Stops A, B, C at 0%, 50% and 100% along the road, timed 17:00, 17:10 and 17:20.
const journeys:RouteJourneys={schema:1,version:'test',routeId:'R17',timezone:'Europe/London',shapes:[road],
 patterns:[{shape:0,stops:['A','B','C'],sequences:[1,2,3],along:stopDistances([at(0),at(.5),at(1)],road)}],
 trips:[['T1',0,[h(17),h(17,10),h(17,20)]],['T2',0,[h(17,30),h(17,40),h(17,50)]]]};
const byRoute=new Map([['R17',journeys]]);
const departure=(tripId:string,seconds:number,sequence=3):Departure=>({tripId,routeId:'R17',headsign:'Tilehurst',direction:'0',sequence,time:origin+seconds*1000,serviceDate:date,approximate:false,pickupType:0});
const bus=(position:LngLat,observedAt:number,extra:Partial<VehicleObservation>={}):VehicleObservation=>({id:'bods:RBUS:701',kind:'bus',position,observedAt:new Date(observedAt).toISOString(),operatorId:'RBUS',label:'17',status:'observed',source:'Bus Open Data Service',timetableTripId:'T1',...extra});
const label=()=>'17';

test('stop distances follow the road in calling order',()=>{
 const along=journeys.patterns[0].along;
 assert.equal(along[0],0);assert.ok(Math.abs(along[1]-along[2]/2)<3);assert.ok(along[2]>1300&&along[2]<1450);
});

test('a bus five minutes behind its own timetable moves the stop estimate back five minutes',()=>{
 // Scheduled at B at 17:10; seen there at 17:15.
 const now=origin+h(17,15)*1000,result=liveDepartures([departure('T1',h(17,20))],[bus(at(.5),now-20_000)],byRoute,label,now);
 const status=result.get(liveKey(departure('T1',h(17,20))));
 assert.equal(status?.state,'estimate');
 if(status?.state!=='estimate')return;
 assert.ok(Math.abs(status.estimate.delaySeconds-280)<=15,`delay ${status.estimate.delaySeconds}`);
 assert.equal(status.estimate.passed,false);
 assert.ok(Math.abs(status.estimate.expected-(origin+h(17,25)*1000-20_000))<=15_000);
 assert.equal(delayLabel(status.estimate.delaySeconds),'5 min late');
});

test('a bus that has passed the stop is reported as passed, not as a countdown',()=>{
 const now=origin+h(17,12)*1000,d=departure('T1',h(17,10),2);
 const status=liveDepartures([d],[bus(at(.8),now)],byRoute,label,now).get(liveKey(d));
 assert.equal(status?.state,'estimate');if(status?.state==='estimate')assert.equal(status.estimate.passed,true);
});

test('a bus waiting at its first stop is never counted as early',()=>{
 const now=origin+h(16,55)*1000,d=departure('T1',h(17,10),2);
 const status=liveDepartures([d],[bus(at(0),now)],byRoute,label,now).get(liveKey(d));
 assert.equal(status?.state,'estimate');if(status?.state==='estimate'){assert.equal(status.estimate.delaySeconds,0);assert.equal(status.estimate.expected,d.time);}
});

test('journeys not yet running keep their scheduled time, with the reason recorded',()=>{
 const now=origin+h(17,5)*1000,later=departure('T2',h(17,40),2);
 assert.deepEqual(liveDepartures([later],[bus(at(.25),now)],byRoute,label,now).get(liveKey(later)),{state:'none',reason:'not-tracked'});
});

test('only a bus that reports the journey, on the same route, gives an estimate',()=>{
 const now=origin+h(17,5)*1000,d=departure('T1',h(17,20)),first=bus(at(.25),now),trip=journeys.trips[0];
 assert.equal(runsJourney(first,'17',trip),true);
 assert.equal(runsJourney({...first,timetableTripId:undefined},'17',trip),false,'route number alone is not enough');
 assert.equal(runsJourney({...first,timetableTripId:'T2'},'17',trip),false);
 assert.equal(runsJourney({...first,label:'17a'},'17',trip),false);
 assert.equal(runsJourney({...first,operatorId:'TVB'},'17',trip),false);
 // Two buses claiming the same journey: neither is trusted.
 const twin={...first,id:'bods:RBUS:702'};
 assert.deepEqual(liveDepartures([d],[first,twin],byRoute,label,now).get(liveKey(d)),{state:'none',reason:'ambiguous'});
 // A position more than a few minutes old is not used.
 assert.deepEqual(liveDepartures([d],[bus(at(.25),now-240_000)],byRoute,label,now).get(liveKey(d)),{state:'none',reason:'stale'});
 // A bus away from the journey's road is not used either.
 assert.deepEqual(liveDepartures([d],[bus([-0.97,51.46],now)],byRoute,label,now).get(liveKey(d)),{state:'none',reason:'off-route'});
 // Nor one whose implied delay is implausible (over an hour late).
 assert.deepEqual(liveDepartures([d],[bus(at(.1),origin+h(18,30)*1000)],byRoute,label,origin+h(18,30)*1000).get(liveKey(d)),{state:'none',reason:'off-route'});
 // Routes without compiled journey data are marked as such.
 assert.deepEqual(liveDepartures([{...d,routeId:'OTHER'}],[first],byRoute,label,now).get(liveKey(d)),{state:'none',reason:'no-journey-data'});
});

test('countdowns and delay labels read as a passenger expects',()=>{
 assert.equal(countdown(1_000_000+30_000,1_000_000),'Due');assert.equal(countdown(1_000_000+6*60_000+5_000,1_000_000),'6 min');
 assert.equal(delayLabel(20),'on time');assert.equal(delayLabel(-130),'2 min early');assert.equal(delayLabel(600),'10 min late');
});

// Minimal protobuf writer for the GTFS-RT fields the reader uses.
const varint=(n:number)=>{const out:number[]=[];do{let byte=n%128;n=Math.floor(n/128);if(n)byte|=128;out.push(byte);}while(n);return out;};
const bytes=(field:number,payload:number[]|string)=>{const body=typeof payload==='string'?[...new TextEncoder().encode(payload)]:payload;return [...varint(field*8+2),...varint(body.length),...body];};
const number=(field:number,n:number)=>[...varint(field*8),...varint(n)];
const entity=(vehicle:string,trip:string,timestamp:number)=>bytes(2,[...bytes(1,vehicle+'-entity'),...bytes(4,[...bytes(1,[...bytes(1,trip),...bytes(5,'R17')]),...bytes(2,[0x0d,0,0,0x80,0x3f]),...number(5,timestamp),...bytes(8,bytes(1,vehicle))])]);

test('GTFS-RT vehicle positions give each vehicle its timetabled trip',()=>{
 const header=bytes(1,[...bytes(1,'2.0'),...number(3,1790000000)]);
 const feed=new Uint8Array([...header,...entity('YN14MYC','VJabc',1790000000),...entity('DD16GAS','VJdef',1790000010)]);
 assert.deepEqual(parseVehicleTrips(feed),[
  {vehicleId:'YN14MYC',tripId:'VJabc',routeId:'R17',startDate:undefined,timestamp:1790000000_000},
  {vehicleId:'DD16GAS',tripId:'VJdef',routeId:'R17',startDate:undefined,timestamp:1790000010_000}]);
 assert.throws(()=>parseVehicleTrips(new Uint8Array([0x12,0x05,0x01])),/Truncated/);
});

test('the two BODS feeds join on the vehicle registration, only when they agree in time',()=>{
 const seen=1790000000_000,sighting=(ref:string)=>bus(at(.5),seen,{id:`bods:RBUS:${ref}`,timetableTripId:undefined});
 const [joined,late,unknown,twice]=withTimetableTrips([sighting('YN14MYC'),sighting('DD16GAS'),sighting('LL74WND'),sighting('BU52GAS')],[
  {vehicleId:'YN14 MYC',tripId:'VJabc',timestamp:seen+20_000},
  {vehicleId:'DD16GAS',tripId:'VJdef',timestamp:seen-600_000},
  {vehicleId:'BU52GAS',tripId:'VJ1'},{vehicleId:'BU52GAS',tripId:'VJ2'}]);
 assert.equal(joined.timetableTripId,'VJabc');
 assert.equal(late.timetableTripId,undefined,'a trip reported ten minutes apart may be an earlier journey');
 assert.equal(unknown.timetableTripId,undefined);assert.equal(twice.timetableTripId,undefined,'conflicting trips give none');
});

test('the compiler writes per-route journeys with their timed calls inside the map',()=>{
 const tables:Record<string,Record<string,string>[]>={
  'agency.txt':[{agency_timezone:'Europe/London'}],
  'routes.txt':[{route_id:'R17',route_short_name:'17'}],
  'trips.txt':[{trip_id:'T1',route_id:'R17',service_id:'S',shape_id:'road',trip_headsign:'Tilehurst',direction_id:'0'}],
  'calendar.txt':[{service_id:'S',start_date:'20261001',end_date:'20261031',monday:'1',tuesday:'1',wednesday:'1',thursday:'1',friday:'1',saturday:'0',sunday:'0'}],
  'stops.txt':[{stop_id:'FAR',stop_name:'Far',stop_lat:'51.3',stop_lon:'-1.3'},...['A','B','C'].map((id,i)=>({stop_id:id,stop_name:id,stop_lat:'51.455',stop_lon:String(-0.98+0.01*i)}))],
  'stop_times.txt':[['FAR','16:40:00',1],['A','17:00:00',2],['B','17:10:00',3],['C','17:20:00',4]].map(([stop_id,time,sequence])=>({trip_id:'T1',stop_id:String(stop_id),stop_sequence:String(sequence),arrival_time:String(time),departure_time:String(time)})),
 };
 const result=compileTimetable(file=>tables[file]??[],{source:'test',sourceUrl:'https://example.test',licence:'OGL',retrievedAt:'2026-10-01T00:00:00Z'},'v1',[],{road});
 assert.match(result.index.routes.R17.journeysUrl!,/^\/data\/timetables\/v1\/journeys-[0-9a-f]{20}\.json$/);
 const [data]=[...result.journeyFiles.values()];
 assert.deepEqual(data.trips,[['T1',0,[h(17),h(17,10),h(17,20)]]],'the call outside the map is left out');
 assert.deepEqual(data.patterns[0].stops,['A','B','C']);assert.deepEqual(data.patterns[0].sequences,[2,3,4]);
});
