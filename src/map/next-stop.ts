import type {VehicleObservation} from '../../shared/types';
import {nextBusStop,readingOperator,type NextBusStop,type RouteJourneys} from '../../shared/live-departures';
import {addDays,headingAt,localDate,type StopIndex,type StopTimetable} from '../../shared/timetable';
// The stop index and a route's journeys load only when someone opens a bus card, and are kept for the visit.
let index:Promise<StopIndex>|undefined;
const journeys=new globalThis.Map<string,Promise<RouteJourneys|undefined>>();
const json=async<T>(url:string)=>{const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Unavailable');return await r.json() as T;};
export type NamedNextStop=NextBusStop&{name:string;code?:string;heading?:{towards:string;then?:string}};
/** The next stop of a Reading Buses vehicle matched to a timetabled journey, or undefined when it cannot be judged. */
export async function findNextBusStop(o:VehicleObservation,now=Date.now()):Promise<NamedNextStop|undefined>{
 if(o.kind!=='bus'||!o.timetableTripId||!readingOperator(o))return undefined;
 index??=json<StopIndex>('/data/bus-stops.json').catch(error=>{index=undefined;throw error;});
 const data=await index,label=o.label.trim().toLowerCase(),today=localDate(now,data.timezone),dates=[today,addDays(today,-1)];
 for(const [id,route] of Object.entries(data.routes)){
  const url=route.journeysUrl;if(!url||route.label.trim().toLowerCase()!==label)continue;
  if(!journeys.has(url))journeys.set(url,json<RouteJourneys>(url).then(j=>j.schema===1&&j.routeId===id?j:undefined,()=>{journeys.delete(url);return undefined;}));
  const j=await journeys.get(url);if(!j)continue;
  const next=nextBusStop(o,j,o.timetableTripId,dates);
  if(next){const stop=data.stops.find(s=>s.id===next.stopId);
   // The stop's own timetable says where the journey is heading from there, which on a loop is its far side.
   const heading=stop?.timetableUrl?await json<StopTimetable>(stop.timetableUrl).then(t=>headingAt(t,o.timetableTripId!),()=>undefined):undefined;
   return {...next,name:stop?.name??next.stopId,...(stop?.code?{code:stop.code}:{}),...(heading?{heading}:{})};}
 }
 return undefined;
}
