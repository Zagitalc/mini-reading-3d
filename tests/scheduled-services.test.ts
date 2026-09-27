import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTimetable} from '../scripts/compile-timetable';
import {networkAt,nightProfile,serviceNightTime,type ServiceSummary,type ServiceTrip} from '../shared/scheduled-services';

const index=(validFrom='20261001',validUntil='20261031')=>({validFrom,validUntil,timezone:'Europe/London'});
const h=(hours:number,minutes=0)=>hours*3600+minutes*60;
// Friday 2 October 2026 only, so neighbouring nights show what comes from which service date.
const friday={start:'20261002',end:'20261002',weekdays:'0000100',exceptions:{}},saturday={start:'20261003',end:'20261003',weekdays:'0000010',exceptions:{}};
const summary=(trips:ServiceTrip[]):ServiceSummary=>({schema:1,version:'test',timezone:'Europe/London',services:[friday,saturday],trips});
const iso=(ms:number)=>new Date(ms).toISOString();

test('clock times before 04:00 belong to the early hours after the chosen service date',()=>{
 assert.equal(iso(serviceNightTime('20261002','23:30')),'2026-10-02T22:30:00.000Z');
 assert.equal(iso(serviceNightTime('20261002','00:30')),'2026-10-02T23:30:00.000Z');
 assert.equal(iso(serviceNightTime('20261002','03:59')),'2026-10-03T02:59:00.000Z');
 assert.equal(iso(serviceNightTime('20261002','04:00')),'2026-10-02T03:00:00.000Z');
 // The clocks go back at 02:00 BST on Sunday 25 October: 03:00 is then GMT.
 assert.equal(iso(serviceNightTime('20261024','03:00')),'2026-10-25T03:00:00.000Z');
 assert.equal(iso(serviceNightTime('20261024','23:00')),'2026-10-24T22:00:00.000Z');
});

test('routes are on the road, still to start or finished at the chosen moment',()=>{
 const result=networkAt(summary([
  [0,'17','Wokingham Road','0',h(22,50),h(23,40),'A'],
  [0,'17','Tilehurst','1',h(23,50),h(24,30),'B'],
  [0,'17','Wokingham Road','0',h(25,10),h(25,50),'A'],
  [0,'5','Whitley Wood','0',h(22,0),h(22,40),'C'],
  [0,'X4','Bracknell','0',h(23,45),h(24,40),'D'],
  [0,'26','Calcot','0',h(12,0),h(12,30),'E'],
  [1,'9','Southcote','0',h(12,0),h(12,30),'F'],
 ]),index(),'20261002','23:30');
 assert.equal(result.state,'covered');assert.equal(result.onRoad,1);
 const route=(id:string)=>result.routes.find(r=>r.routeId===id)!;
 assert.equal(route('17').state,'running');assert.equal(route('17').running,1);assert.equal(route('17').remaining,2);
 assert.deepEqual(route('17').destinations.map(d=>[d.headsign,d.remaining]),[['Wokingham Road',1],['Tilehurst',1]],'latest last departure first');
 assert.equal(iso(route('17').last.start),'2026-10-03T00:10:00.000Z','a 25:10 journey is still Friday night');
 assert.equal(route('5').state,'finished');assert.equal(iso(route('5').last.start),'2026-10-02T21:00:00.000Z');
 assert.equal(route('X4').state,'later');assert.equal(iso(route('X4').next!.start),'2026-10-02T22:45:00.000Z');
 assert.equal(route('26').state,'finished','a daytime route has finished by the evening');
 assert.deepEqual(result.notRunning,['9'],'Saturday-only route does not run on Friday night');
});

test('an early journey from the next service date counts before 04:00, and 04:00 opens a new night',()=>{
 const data=summary([[1,'17','Wokingham Road','0',h(3,20),h(4,10),'A'],[0,'17','Tilehurst','1',h(22,0),h(22,30),'B']]);
 const late=networkAt(data,index(),'20261002','03:30');
 assert.equal(late.onRoad,1);assert.equal(late.routes[0].state,'running');
 const earlier=networkAt(data,index(),'20261002','23:00');
 assert.equal(earlier.routes[0].state,'later');assert.equal(earlier.routes[0].remaining,1);
 assert.equal(iso(earlier.routes[0].last.start),'2026-10-03T02:20:00.000Z');
 const saturday=networkAt(data,index(),'20261003','05:00');
 assert.equal(saturday.routes.length,1,'the 03:20 journey still on the road after 04:00 belongs to both nights');assert.equal(saturday.routes[0].running,0);
});

test('nights outside the snapshot are uncovered, and nights at its edge are partial',()=>{
 const data=summary([[0,'17','Wokingham Road','0',h(23,0),h(23,30),'A']]);
 assert.equal(networkAt(data,index('20261003'),'20261002','23:00').state,'uncovered');
 assert.equal(networkAt(data,index('20261002','20261002'),'20261002','23:10').state,'partial');
 assert.equal(networkAt(data,index('20261002','20261002'),'20261002','23:10').onRoad,1);
 assert.deepEqual(nightProfile(data,index('20261003'),'20261002'),[]);
});

test('the night profile samples journeys on the road every 15 minutes until 04:00',()=>{
 const points=nightProfile(summary([[0,'17','Wokingham Road','0',h(23,0),h(23,31),'A'],[0,'5','Whitley Wood','0',h(23,15),h(25,0),'C']]),index(),'20261002','22:00');
 assert.equal(points.length,24);assert.equal(points[0].clock,'22:00');assert.equal(points.at(-1)!.clock,'03:45');
 const at=(clock:string)=>points.find(p=>p.clock===clock)!;
 assert.equal(at('22:45').journeys,0);assert.equal(at('23:15').journeys,2);assert.equal(at('23:15').routes,2);assert.equal(at('00:30').journeys,1);assert.equal(at('01:00').journeys,0);
});

test('the compiled service summary runs from each journey’s first boarding to its last call, terminal included',()=>{
 const files:Record<string,Record<string,string>[]>={
  'agency.txt':[{agency_timezone:'Europe/London'}],
  'routes.txt':[{route_id:'R',route_short_name:'17'}],
  'trips.txt':[{trip_id:'T',route_id:'R',service_id:'S',trip_headsign:'Town',direction_id:'0'},{trip_id:'F',route_id:'R',service_id:'S'}],
  'stops.txt':[{stop_id:'A',stop_name:'Depot',stop_lon:'-.97',stop_lat:'51.45'},{stop_id:'B',stop_name:'Station',stop_lon:'-.97',stop_lat:'51.45'},{stop_id:'C',stop_name:'Town',stop_lon:'-.97',stop_lat:'51.45'},{stop_id:'Far',stop_name:'Outside',stop_lon:'-2',stop_lat:'53'}],
  'calendar_dates.txt':[{service_id:'S',date:'20261002',exception_type:'1'}],
  'frequencies.txt':[{trip_id:'F'}],
  // Listed out of order; A is set-down only, so boarding starts at B. The journey continues beyond the map to Far.
  'stop_times.txt':[{stop_id:'C',trip_id:'T',arrival_time:'24:40:00',departure_time:'24:41:00',stop_sequence:'3'},{stop_id:'B',trip_id:'T',departure_time:'24:05:00',stop_sequence:'2',stop_headsign:'Town Centre'},{stop_id:'A',trip_id:'T',departure_time:'23:55:00',stop_sequence:'1',pickup_type:'1'},{stop_id:'Far',trip_id:'T',departure_time:'25:30:00',stop_sequence:'4'},{stop_id:'B',trip_id:'F',departure_time:'08:00:00',stop_sequence:'1'},{stop_id:'C',trip_id:'F',departure_time:'08:30:00',stop_sequence:'2'}],
 };
 const result=compileTimetable(f=>files[f]??[],{source:'Test',sourceUrl:'',licence:'',retrievedAt:''},'v1');
 assert.deepEqual(result.summary.trips,[[0,'R','Town Centre','0',h(24,5),h(24,40),'B']],'frequency trips are omitted and the out-of-area call does not extend the journey');
 assert.match(result.index.servicesUrl!,/^\/data\/timetables\/v1\/services-[0-9a-f]{20}\.json$/);
 assert.equal(result.summaryFile,result.index.servicesUrl!.split('/').at(-1));
});
