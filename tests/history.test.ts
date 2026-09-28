import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applyMinute,delayMinutes,fuelDay,historyResponse,hourKey,londonClock,londonDay,recordMinute,summariseHour,type HourRecord,type MinuteInput} from '../shared/history';
import {sqliteHistory} from '../server/history';
import type {StationBoard,RailDeparture} from '../shared/rail-board';
import type {FeedStatus,FuelStation} from '../shared/types';
// 20:30 UTC is 21:30 in London during BST.
const now=Date.parse('2026-09-28T20:30:00Z');
const feed=(id:FeedStatus['id'],state:FeedStatus['state']):FeedStatus=>({id,label:id,state,message:'',count:0,intervalMs:60_000});
const departure=(id:string,scheduled:string,expected='On time',cancelled=false):RailDeparture=>({id,scheduled,expected,destination:'London Paddington',operator:'GWR',cancelled});
const board=(services:RailDeparture[],generatedAt=new Date(now).toISOString()):StationBoard=>({schema:1,station:'RDG',name:'Reading',generatedAt,services,messages:[],source:'RDM',sourceUrl:'https://example.test'});
const minute=(input:Partial<MinuteInput>={}):MinuteInput=>({now,buses:null,trains:null,board:null,feeds:[],...input});
const station=(id:string,prices:Record<string,number>,observedAt='2026-09-28T18:00:00Z'):FuelStation=>({id,name:id,brand:'Test',postcode:'RG1',position:[-0.97,51.45],quiet:false,observedAt,source:'test',prices:Object.fromEntries(Object.entries(prices).map(([g,pence])=>[g,{pence,submittedAt:'2026-09-28T09:00:00Z'}]))});
function memoryStore(){
 const hours=new Map<string,HourRecord>(),fuel=new Map<string,ReturnType<typeof fuelDay>>();
 return {hours,fuel,store:{
  async hours(keys:string[]){return keys.flatMap(k=>hours.has(k)?[structuredClone(hours.get(k)!)]:[]);},
  async saveHours(rows:HourRecord[]){for(const r of rows)hours.set(r.hour,structuredClone(r));},
  async fuelObservedAt(day:string){return fuel.get(day)?.observedAt;},
  async saveFuel(day:NonNullable<ReturnType<typeof fuelDay>>){fuel.set(day.day,day);},
  async range(fromHour:string,fromDay:string){return {hours:[...hours.values()].filter(h=>h.hour>=fromHour),fuel:[...fuel.values()].filter(d=>d!.day>=fromDay) as NonNullable<ReturnType<typeof fuelDay>>[],since:[...hours.keys()].sort()[0]??null};},
 }};
}
test('London board times resolve to the nearest instant, across midnight and in winter time',()=>{
 assert.equal(new Date(londonClock('21:45',now)!).toISOString(),'2026-09-28T20:45:00.000Z');
 assert.equal(new Date(londonClock('00:10',Date.parse('2026-09-28T22:55:00Z'))!).toISOString(),'2026-09-28T23:10:00.000Z','23:55 London looks ahead to 00:10 the next day');
 assert.equal(new Date(londonClock('23:50',Date.parse('2026-09-28T23:05:00Z'))!).toISOString(),'2026-09-28T22:50:00.000Z','00:05 London looks back to 23:50');
 assert.equal(new Date(londonClock('08:00',Date.parse('2026-12-01T07:30:00Z'))!).toISOString(),'2026-12-01T08:00:00.000Z','GMT in winter');
 assert.equal(londonClock('soon',now),undefined);
 assert.equal(londonDay(Date.parse('2026-09-28T23:30:00Z')),'2026-09-29','the fuel day follows London, not UTC');
});
test('Darwin estimates become delay minutes',()=>{
 assert.equal(delayMinutes('21:40','On time',now),0);
 assert.equal(delayMinutes('21:40','21:47',now),7);
 assert.equal(delayMinutes('23:58','00:03',Date.parse('2026-09-28T22:50:00Z')),5,'a delay across midnight');
 assert.equal(delayMinutes('21:40','Delayed',now),-1);
 assert.equal(delayMinutes('21:40','21:38',now),0,'early is not negative lateness');
});
test('a minute adds to the current hour and records near departures under their scheduled hour',()=>{
 const rows=new Map<string,HourRecord>();
 const touched=applyMinute(rows,minute({buses:{count:80,routes:20},trains:{count:12},feeds:[feed('trains','live'),feed('weather','stale'),feed('buses','live')],
  board:board([departure('a','21:35'),departure('b','21:40','21:52'),departure('c','21:44','Cancelled',true),departure('late','22:05'),departure('far','21:50')])}));
 assert.deepEqual(touched,['2026-09-28T20:00Z']);
 const hour=rows.get('2026-09-28T20:00Z')!;
 assert.equal(hour.minutes,1);assert.deepEqual([hour.buses.minutes,hour.buses.sum,hour.buses.routesSum],[1,80,20]);
 assert.deepEqual(Object.keys(hour.rail),['a','b','c'],'departures more than 15 minutes away wait until they are close');
 assert.deepEqual(hour.rail.b,['21:40',12,0]);assert.deepEqual(hour.rail.c,['21:44',0,1]);
 assert.deepEqual(hour.feeds,{trains:{live:1},weather:{stale:1}},'buses are map-driven, so their health is not recorded as uptime');
 // Twenty minutes on: no fresh buses, a later estimate replaces the earlier one, and a 22:02 departure opens the next hour.
 const next=now+20*60_000;
 assert.deepEqual(applyMinute(rows,minute({now:next,board:board([departure('b','21:40','21:55'),departure('d','22:02')],new Date(next).toISOString())})),['2026-09-28T20:00Z','2026-09-28T21:00Z']);
 assert.equal(hour.minutes,2);assert.equal(hour.buses.minutes,1,'an hour without map viewers is not counted as zero buses');
 assert.deepEqual(hour.rail.b,['21:40',15,0]);assert.deepEqual(rows.get('2026-09-28T21:00Z')!.minutes,0,'a departure alone does not count as a recorded minute');
 applyMinute(rows,minute({now:next+60_000,board:board([departure('e','21:59')],'2026-09-28T20:00:00Z')}));
 assert.equal(hour.rail.e,undefined,'a board older than five minutes is ignored');
});
test('hour summaries report averages, lateness and the live share of each feed',()=>{
 const rows=new Map<string,HourRecord>();
 applyMinute(rows,minute({buses:{count:80,routes:20},feeds:[feed('trains','live')],board:board([departure('a','21:35'),departure('b','21:40','21:44'),departure('c','21:41','21:46'),departure('d','21:42','Delayed'),departure('x','21:43','Cancelled',true)])}));
 applyMinute(rows,minute({now:now+60_000,buses:{count:90,routes:21},feeds:[feed('trains','stale')]}));
 applyMinute(rows,minute({now:now+120_000,feeds:[feed('trains','live')]}));
 const s=summariseHour(rows.get(hourKey(now))!);
 assert.deepEqual(s.buses,{minutes:2,mean:85,max:90,routes:20.5});assert.equal(s.trains,null);
 assert.deepEqual(s.rail,{departures:5,onTime:2,late:2,cancelled:1,worstDelay:5},'four minutes late is on time; an unestimated delay counts as late');
 assert.deepEqual(s.feeds,{trains:0.67});
});
test('a day of fuel prices keeps every station and the town spread per grade',()=>{
 const day=fuelDay([station('a',{E10:139.9,B7S:149.9}),station('b',{E10:141.9}),station('c',{E10:139.9,B7S:151.9},'2026-09-28T19:00:00Z')],now)!;
 assert.equal(day.day,'2026-09-28');assert.equal(day.observedAt,'2026-09-28T19:00:00Z');assert.equal(day.stations.length,3);
 assert.deepEqual(day.grades.E10,{stations:3,cheapest:139.9,median:139.9,dearest:141.9,cheapestIds:['a','c']});
 assert.deepEqual(day.grades.B7S,{stations:2,cheapest:149.9,median:150.9,dearest:151.9,cheapestIds:['a']});
 assert.equal(fuelDay([],now),null);
});
test('recording rewrites the fuel day only for a newer snapshot, and the API range leaves out station rows',async()=>{
 const {store,hours,fuel}=memoryStore();
 await recordMinute(store,minute({buses:{count:5,routes:2}}),[station('a',{E10:140})]);
 await recordMinute(store,minute({now:now+60_000}),[station('a',{E10:150},'2026-09-28T17:00:00Z')]);
 assert.equal(fuel.get('2026-09-28')!.grades.E10.cheapest,140,'an older snapshot does not replace a newer one');
 await recordMinute(store,minute({now:now+120_000}),[station('a',{E10:138},'2026-09-28T20:00:00Z')]);
 assert.equal(fuel.get('2026-09-28')!.grades.E10.cheapest,138);
 assert.equal(hours.get('2026-09-28T20:00Z')!.minutes,3);
 hours.set('2026-09-01T00:00Z',{...hours.get('2026-09-28T20:00Z')!,hour:'2026-09-01T00:00Z'});
 const response=await historyResponse(store,7,now+180_000);
 assert.equal(response.from,'2026-09-21T21:00Z');assert.equal(response.recordingSince,'2026-09-01T00:00Z');
 assert.deepEqual(response.hours.map(h=>h.hour),['2026-09-28T20:00Z'],'hours before the range are left out');
 assert.equal(response.hours[0].buses!.mean,5);assert.equal('stations' in response.fuel[0],false);
 assert.equal((await historyResponse(store,999,now)).from,'2026-09-14T21:00Z','the range is capped at 14 days');
});
test('the local SQLite store round-trips hours and fuel days',async()=>{
 const db=new DatabaseSync(':memory:'),store=sqliteHistory(db);
 await recordMinute(store,minute({trains:{count:9},feeds:[feed('fuel','live')]}),[station('a',{E10:140})]);
 await recordMinute(store,minute({now:now+60_000,trains:{count:11}}),[station('a',{E10:140})]);
 const response=await historyResponse(store,1,now+120_000);
 assert.deepEqual(response.hours[0].trains,{minutes:2,mean:10,max:11});assert.equal(response.fuel[0].grades.E10.stations,1);
 assert.equal(db.prepare('SELECT count(*) AS n FROM history_fuel').get()!.n,1);
 db.close();
});
