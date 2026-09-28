import type {D1Database} from '@cloudflare/workers-types';
import {fuelHistoryFrom,historyResponse,recordMinute,routeCount,stationHistory,type FuelDay,type HistoryStore,type HourRecord} from '../shared/history';
import type {StationBoard} from '../shared/rail-board';
import type {FeedStatus,FuelStation,VehicleObservation} from '../shared/types';
import type {Env} from './env';
import type {CloudStore} from './store';

export function d1History(db:D1Database):HistoryStore {
 return {
  async hours(keys){
   const result=await db.prepare(`SELECT body FROM history_hours WHERE hour IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all<{body:string}>();
   return result.results.map(r=>JSON.parse(r.body) as HourRecord);
  },
  async saveHours(rows){
   if(rows.length)await db.batch(rows.map(r=>db.prepare('INSERT INTO history_hours VALUES(?,?) ON CONFLICT(hour) DO UPDATE SET body=excluded.body').bind(r.hour,JSON.stringify(r))));
  },
  async fuelObservedAt(day){return (await db.prepare('SELECT observed_at FROM history_fuel WHERE day=?').bind(day).first<{observed_at:string}>())?.observed_at;},
  async saveFuel(day){await db.prepare('INSERT INTO history_fuel VALUES(?,?,?) ON CONFLICT(day) DO UPDATE SET observed_at=excluded.observed_at,body=excluded.body').bind(day.day,day.observedAt,JSON.stringify(day)).run();},
  async range(fromHour,fromDay){
   const [hours,fuel,since]=await db.batch<{body?:string;hour?:string}>([
    db.prepare('SELECT body FROM history_hours WHERE hour>=?').bind(fromHour),
    db.prepare('SELECT body FROM history_fuel WHERE day>=?').bind(fromDay),
    db.prepare('SELECT min(hour) AS hour FROM history_hours'),
   ]);
   return {hours:hours.results.map(r=>JSON.parse(r.body!) as HourRecord),fuel:fuel.results.map(r=>JSON.parse(r.body!) as FuelDay),since:since.results[0]?.hour??null};
  },
 };
}

/** One sample per cron minute, read from snapshots the feeds have already saved; it makes no provider calls. */
export async function recordHistory(env:Env,store:CloudStore,feeds:FeedStatus[],now=Date.now()) {
 // The lease keeps an overlapping cron invocation from counting the same minute twice.
 const minuteEnd=Math.floor(now/60_000)*60_000+60_000;
 const lease=await env.DB.prepare("INSERT INTO state VALUES('history-lease',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body WHERE CAST(state.body AS INTEGER)<=? RETURNING body").bind(String(minuteEnd),now).first();
 if(!lease)return;
 const recent=(f?:FeedStatus)=>!!f?.lastSuccess&&now-Date.parse(f.lastSuccess)<120_000;
 const busHealth=env.BODS_API_KEY?await store.state<FeedStatus>('buses'):undefined;
 const railHealth=(env.RDM_API_KEY||env.DARWIN_TOKEN)?await store.state<FeedStatus>('trains'):undefined;
 const fuel=env.FUEL_ENABLED==='true'?(await store.items<FuelStation>('fuel')).filter(f=>now-Date.parse(f.observedAt)<48*3_600_000):[];
 await recordMinute(d1History(env.DB),{now,feeds,
  buses:recent(busHealth)?{count:busHealth!.count,routes:routeCount(await store.items<VehicleObservation>('buses'))}:null,
  trains:recent(railHealth)?{count:railHealth!.count}:null,
  board:railHealth?await store.state<StationBoard>('rail-board:RDG')??null:null},fuel);
}

export const historyFor=(env:Env,days:number)=>historyResponse(d1History(env.DB),days);

/** One station's recorded daily prices, for the forecourt's own chart. */
export async function fuelHistoryFor(env:Env,id:string,days:number) {
 const rows=await env.DB.prepare('SELECT body FROM history_fuel WHERE day>=?').bind(fuelHistoryFrom(days)).all<{body:string}>();
 return {version:1,id,days:stationHistory(rows.results.map(r=>JSON.parse(r.body) as FuelDay),id)};
}
