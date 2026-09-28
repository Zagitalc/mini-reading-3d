import test from 'node:test';
import assert from 'node:assert/strict';
import {frequencyScenario,positionAt,routeJourneysOn,waits} from '../shared/scenarios';
import {serviceNightTime,type ServiceSummary,type ServiceTrip} from '../shared/scheduled-services';
import type {RouteJourneys,JourneyTrip} from '../shared/live-departures';

const index={validFrom:'20261001',validUntil:'20261031',timezone:'Europe/London'};
const h=(hours:number,minutes=0)=>hours*3600+minutes*60;
const min=60_000;
const weekdays={start:'20261001',end:'20261031',weekdays:'1111100',exceptions:{}};
const saturdays={start:'20261001',end:'20261031',weekdays:'0000010',exceptions:{}};
// Route 17 in miniature: A → B → C outbound in 30 minutes, C → B → A inbound in 30 minutes, plus a short working A → B.
const patterns=[{shape:0,stops:['A','B','C'],sequences:[1,2,3],along:[0,1000,2000]},{shape:1,stops:['C','B','A'],sequences:[1,2,3],along:[0,1000,2000]},{shape:0,stops:['A','B'],sequences:[1,2],along:[0,1000]}];
const out=(start:number):[ServiceTrip,JourneyTrip]=>[[0,'17','C','0',start,start+h(0,30),'A'],[`out-${start}`,0,[start,start+h(0,15),start+h(0,30)]]];
const back=(start:number):[ServiceTrip,JourneyTrip]=>[[0,'17','A','1',start,start+h(0,30),'C'],[`back-${start}`,1,[start,start+h(0,15),start+h(0,30)]]];
const short=(start:number):[ServiceTrip,JourneyTrip]=>[[0,'17','B','0',start,start+h(0,10),'A'],[`short-${start}`,2,[start,start+h(0,10)]]];
function network(pairs:[ServiceTrip,JourneyTrip][]){
 const summary:ServiceSummary={schema:1,version:'test',timezone:'Europe/London',services:[weekdays,saturdays],trips:pairs.map(p=>p[0])};
 const journeys:RouteJourneys={schema:1,version:'test',routeId:'17',timezone:'Europe/London',shapes:[[[-1,51.45],[-0.97,51.45]],[[-0.97,51.45],[-1,51.45]]],patterns,trips:pairs.map(p=>p[1])};
 return {summary,journeys};
}
// Every 20 minutes each way from 19:00 to 23:40 on weekdays, with one short working at 20:05.
const evening=()=>network([...Array.from({length:15},(_,i)=>out(h(19,i*20))),...Array.from({length:15},(_,i)=>back(h(19,10+i*20))),short(h(20,5))]);
const at=(clock:string)=>serviceNightTime('20261002',clock);

test('waits average over arrivals in the window and report the longest gap',()=>{
 const start=at('20:00'),end=at('21:00');
 const even=waits([start,start+20*min,start+40*min,start+60*min],start,end);
 assert.equal(even.departures,3);assert.equal(even.meanWait,10);assert.equal(even.longestWait,20);
 // Bunched buses: two together then a 40 minute gap. Same number of buses, longer average wait.
 const bunched=waits([start,start+2*min,start+42*min,start+60*min],start,end);
 assert.equal(bunched.departures,3);assert.ok(bunched.meanWait>even.meanWait);assert.equal(bunched.longestWait,40);
 // No bus after 20:30: those arrivals are left out and flagged rather than counted as endless waits.
 const early=waits([start+10*min,start+30*min],start,end);
 assert.equal(early.noBusFrom,start+30*min);
 // Ten minutes of arrivals wait 5 on average, the next twenty wait 10: (10×5 + 20×10) / 30.
 assert.equal(early.meanWait,250/30);
});

test('journeys are joined to their call times and only run on their calendar',()=>{
 const {summary,journeys}=evening();
 assert.equal(routeJourneysOn(summary,journeys,index,['20261002']).length,31,'Friday');
 assert.equal(routeJourneysOn(summary,journeys,index,['20261003']).length,0,'Saturday');
 const first=routeJourneysOn(summary,journeys,index,['20261002'])[0];
 assert.equal(first.times[1]-first.times[0],15*min);assert.equal(first.direction,'0');
});

test('a 10 minute scenario doubles departures and halves waits, and needs more buses',()=>{
 const {summary,journeys}=evening();
 const r=frequencyScenario(summary,journeys,index,{routeId:'17',serviceDate:'20261002',from:'20:00',to:'22:00',headwayMinutes:10});
 assert.equal(r.state,'ok');
 const outbound=r.directions.find(d=>d.direction==='0')!;
 assert.equal(outbound.referenceStop,'A','the stop every outbound journey calls at, short working included');
 assert.equal(outbound.today.departures,7,'six full journeys and the short working');
 assert.equal(outbound.scenario.departures,12);
 assert.equal(outbound.scenario.meanWait,5);
 assert.equal(outbound.runMinutes,30,'copied from today’s full journeys, not the short working');
 // 30 minutes running + 5 minutes turnaround each way, but the inbound grid sits 10 minutes after the outbound,
 // so each bus waits 5 more minutes at C: an 80 minute cycle, 8 buses at 10 minute intervals.
 assert.equal(r.vehicles.scenario,8);assert.ok(r.vehicles.today<r.vehicles.scenario);
 assert.equal(r.onRoad.scenario,6);
 assert.equal(r.serviceHours.scenario,(12+11)*30/60,'12 outbound from 20:00 and 11 inbound from 20:10');
});

test('a scenario keeps today’s phase and leaves the rest of the night alone',()=>{
 const {summary,journeys}=evening();
 const r=frequencyScenario(summary,journeys,index,{routeId:'17',serviceDate:'20261002',from:'20:00',to:'22:00',headwayMinutes:20});
 const outbound=r.directions.find(d=>d.direction==='0')!,inbound=r.directions.find(d=>d.direction==='1')!;
 // Same 20 minute interval as today, so only the short working goes.
 assert.equal(outbound.scenario.departures,6);assert.equal(inbound.scenario.departures,inbound.today.departures);
 assert.equal(inbound.scenario.meanWait,inbound.today.meanWait);
 const added=r.scenario.filter(j=>j.scenario&&j.direction==='1');
 assert.equal(added[0].times[0],at('20:10'),'first new inbound departure at today’s first one');
 assert.ok(r.scenario.some(j=>!j.scenario&&j.times[0]===at('19:40')),'the 19:40 journey still finishes during the window');
});

test('the map position moves along the road between calls',()=>{
 const {summary,journeys}=evening();
 const j=routeJourneysOn(summary,journeys,index,['20261002'])[0];
 assert.equal(positionAt(journeys,j,j.times[0]-1),undefined);
 const middle=positionAt(journeys,j,j.times[0]+15*min)!;
 assert.ok(middle[0]>-1&&middle[0]<-0.97);
 assert.equal(positionAt(journeys,j,j.times[2]+1),undefined);
});

test('scenarios refuse nights outside the snapshot and nonsense inputs',()=>{
 const {summary,journeys}=evening();
 const base={routeId:'17',serviceDate:'20261002',from:'20:00',to:'22:00',headwayMinutes:15};
 assert.equal(frequencyScenario(summary,journeys,index,{...base,serviceDate:'20261105'}).state,'uncovered');
 assert.equal(frequencyScenario(summary,journeys,index,{...base,from:'22:00',to:'20:00'}).state,'invalid');
 assert.equal(frequencyScenario(summary,journeys,index,{...base,headwayMinutes:2}).state,'invalid');
 assert.equal(frequencyScenario(summary,journeys,index,{...base,serviceDate:'20261004'}).state,'no-service');
});
