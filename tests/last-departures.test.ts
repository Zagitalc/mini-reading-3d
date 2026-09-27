import test from 'node:test';
import assert from 'node:assert/strict';
import {compareRouteLabels,currentServiceDate,lastDepartures,type StopIndex,type StopTimetable,type StopTime} from '../shared/timetable';

const index=(validFrom='20260901',validUntil='20261031'):Pick<StopIndex,'validFrom'|'validUntil'|'timezone'>=>({validFrom,validUntil,timezone:'Europe/London'});
// Service 0 runs every day; service 1 only on Sundays; service 2 only on 27 September.
const data=(times:StopTime[]):StopTimetable=>({schema:1,stopId:'stop',timezone:'Europe/London',
 services:[{start:'20260901',end:'20261031',weekdays:'1111111',exceptions:{}},{start:'20260901',end:'20261031',weekdays:'0000001',exceptions:{}},{start:'20260927',end:'20260927',weekdays:'0000000',exceptions:{'20260927':1}}],
 trips:[
  {id:'a1',service:0,routeId:'r17',headsign:'Wokingham Road',direction:'0'},
  {id:'a2',service:0,routeId:'r17',headsign:'Wokingham Road',direction:'0'},
  {id:'night',service:1,routeId:'r17',headsign:'Wokingham Road',direction:'0'},
  {id:'b1',service:0,routeId:'r17',headsign:'Reading Station',direction:'1'},
  {id:'short',service:2,routeId:'r17',headsign:'Cemetery Junction',direction:'0'},
  {id:'dropoff',service:0,routeId:'r21',headsign:'Lower Earley',direction:'0'},
 ],times});
const hm=(h:number,m=0)=>h*3600+m*60;
const clock=(ms:number)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',weekday:'short'}).format(ms);

test('last departures cover the whole service day per route, direction and destination',()=>{
 const result=lastDepartures(data([[0,hm(6),1,0,0],[1,hm(22,40),1,0,0],[3,hm(23,5),1,0,0],[4,hm(19),1,0,0]]),index(),'20260927');
 assert.equal(result.state,'covered');
 const byHeadsign=Object.fromEntries(result.groups.map(g=>[g.headsign,g]));
 assert.deepEqual(Object.keys(byHeadsign).sort(),['Cemetery Junction','Reading Station','Wokingham Road']);
 assert.equal(clock(byHeadsign['Wokingham Road'].last.time),'Sun 22:40');
 assert.equal(byHeadsign['Wokingham Road'].count,2);
 assert.equal(byHeadsign['Reading Station'].direction,'1');
 // The short working is dated only on the 27th, so it has no following-day departure.
 assert.equal(byHeadsign['Cemetery Junction'].next,undefined);
 assert.equal(clock(byHeadsign['Wokingham Road'].next!.time),'Mon 06:00');
 assert.equal(byHeadsign['Wokingham Road'].next!.serviceDate,'20260928');
});

test('an after-midnight departure stays the last departure of the service day it belongs to',()=>{
 const result=lastDepartures(data([[1,hm(22,40),1,0,0],[2,hm(24,46),1,0,0],[0,hm(6),1,0,0]]),index(),'20260927');
 const group=result.groups.find(g=>g.headsign==='Wokingham Road')!;
 assert.equal(clock(group.last.time),'Mon 00:46');
 assert.equal(group.last.serviceDate,'20260927');
 assert.equal(group.afterMidnight,true);
 // On Monday the Sunday-only night trip does not run.
 const monday=lastDepartures(data([[1,hm(22,40),1,0,0],[2,hm(24,46),1,0,0]]),index(),'20260928').groups.find(g=>g.headsign==='Wokingham Road')!;
 assert.equal(clock(monday.last.time),'Mon 22:40');
 assert.equal(monday.afterMidnight,false);
});

test('drop-off-only calls and removed services are not last departures',()=>{
 const timetable=data([[5,hm(23),1,0,1],[0,hm(21),1,0,0],[1,hm(23,30),1,0,0]]);
 timetable.services[0].exceptions={'20260927':2};
 const result=lastDepartures(timetable,index(),'20260927');
 assert.equal(result.groups.some(g=>g.routeId==='r21'),false);
 assert.equal(result.groups.length,0);
});

test('dates outside timetable coverage are reported rather than treated as having no buses',()=>{
 const t=data([[0,hm(6),1,0,0]]);
 assert.deepEqual(lastDepartures(t,index('20260901','20260926'),'20260927'),{serviceDate:'20260927',state:'uncovered',nextCovered:false,groups:[]});
 const edge=lastDepartures(t,index('20260901','20260927'),'20260927');
 assert.equal(edge.nextCovered,false);assert.equal(edge.groups[0].next,undefined);
});

test('last departures keep London clock time across the autumn clock change',()=>{
 const result=lastDepartures(data([[0,hm(23,30),1,0,0],[1,hm(25,30),1,0,0]]),index(),'20261025');
 const group=result.groups.find(g=>g.headsign==='Wokingham Road')!;
 assert.equal(new Date(group.last.time).toISOString(),'2026-10-26T01:30:00.000Z');
 assert.equal(clock(group.last.time),'Mon 01:30');
});

test('the service date passengers call tonight changes at 04:00 London time',()=>{
 assert.equal(currentServiceDate(Date.parse('2026-09-27T23:30:00Z')),'20260927');
 assert.equal(currentServiceDate(Date.parse('2026-09-28T02:59:00Z')),'20260927');
 assert.equal(currentServiceDate(Date.parse('2026-09-28T03:00:00Z')),'20260928');
 assert.deepEqual(['X4','17','2a','2','14'].sort(compareRouteLabels),['2','2a','14','17','X4']);
});
