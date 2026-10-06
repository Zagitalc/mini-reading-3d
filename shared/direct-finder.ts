import {distance} from './geo';
import type {RouteJourneys} from './live-departures';
import {scheduledDepartures,type BusStop,type StopTimetable} from './timetable';
import type {LngLat} from './types';
// Direct bus finder: which scheduled buses run from a stop near one picked point to a stop near another, with no change.
// There is no routing engine. It reads each route's own stop pattern, so "direct" means one bus calls at both stops, in
// that order, and the walk at each end is a straight line, not a street route.

/** Stops further than this from a picked point are not offered. */
export const WALK_LIMIT_M=800;
/** How many of the nearest stops to try at each end. */
export const STOPS_PER_END=4;
/** Departures listed for each route and stop pair. */
export const DEPARTURES_SHOWN=3;
/** How far ahead to look for departures. */
export const LOOK_AHEAD_HOURS=6;

export interface Nearby {stop:BusStop;metres:number}
export function nearbyStops(stops:readonly BusStop[],point:LngLat,limit=STOPS_PER_END,maxMetres=WALK_LIMIT_M):Nearby[] {
 return stops.map(stop=>({stop,metres:Math.round(distance(point,stop.position))})).filter(n=>n.metres<=maxMetres)
  .sort((a,b)=>a.metres-b.metres||a.stop.id.localeCompare(b.stop.id)).slice(0,limit);
}
/** Routes that call at a stop near both ends; only these journey files need loading. */
export function sharedRoutes(from:readonly Nearby[],to:readonly Nearby[]):string[] {
 const there=new Set(to.flatMap(n=>n.stop.routeIds));
 return [...new Set(from.flatMap(n=>n.stop.routeIds))].filter(id=>there.has(id));
}
export interface DirectDeparture {tripId:string;departs:number;arrives:number;approximate:boolean;serviceDate:string}
export interface DirectOption {
 routeId:string;headsign:string;from:Nearby;to:Nearby;
 /** Next departures from the boarding stop, soonest first. */
 departures:DirectDeparture[];
 /** Riding time of the first listed departure, in minutes. */
 rideMinutes:number;
}
export interface DirectInput {
 /** Timetable of each candidate boarding stop, with its walk from the first point. */
 origins:{walk:Nearby;data:StopTimetable}[];
 /** Candidate alighting stops with their walk to the second point. */
 destinations:readonly Nearby[];
 journeys:ReadonlyMap<string,RouteJourneys>;
 now:number;hours?:number;
}
/** Every direct option, the earliest first. For each departure the alighting stop with the shortest walk after the boarding stop wins. */
export function findDirect(input:DirectInput):DirectOption[] {
 const {now,journeys}=input,hours=input.hours??LOOK_AHEAD_HOURS,walkTo=new Map(input.destinations.map(d=>[d.stop.id,d]));
 const byTrip=new Map<string,Map<string,{pattern:RouteJourneys['patterns'][number];times:number[]}>>();
 for(const [routeId,data] of journeys){const m=new Map<string,{pattern:RouteJourneys['patterns'][number];times:number[]}>();for(const [id,pattern,times] of data.trips)m.set(id,{pattern:data.patterns[pattern],times});byTrip.set(routeId,m);}
 const groups=new Map<string,DirectOption>();
 for(const {walk,data} of input.origins){
  for(const d of scheduledDepartures(data,now,hours,Infinity)){
   const trip=byTrip.get(d.routeId)?.get(d.tripId);if(!trip)continue;
   const {pattern,times}=trip,i=pattern.sequences.indexOf(d.sequence);if(i<0||pattern.stops[i]!==walk.stop.id)continue;
   let best:{j:number;to:Nearby}|undefined;
   for(let j=i+1;j<pattern.stops.length;j++){const to=walkTo.get(pattern.stops[j]);if(!to||to.stop.id===walk.stop.id)continue;if(!best||to.metres<best.to.metres)best={j,to};}
   if(!best)continue;
   const key=`${d.routeId}|${walk.stop.id}|${best.to.stop.id}|${d.headsign}`;
   let option=groups.get(key);if(!option){option={routeId:d.routeId,headsign:d.headsign,from:walk,to:best.to,departures:[],rideMinutes:0};groups.set(key,option);}
   if(option.departures.length<DEPARTURES_SHOWN)option.departures.push({tripId:d.tripId,departs:d.time,arrives:d.time+(times[best.j]-times[i])*1000,approximate:d.approximate,serviceDate:d.serviceDate});
  }
 }
 const out=[...groups.values()];
 for(const o of out)o.rideMinutes=Math.max(1,Math.round((o.departures[0].arrives-o.departures[0].departs)/60000));
 return out.sort((a,b)=>a.departures[0].departs-b.departures[0].departs||a.routeId.localeCompare(b.routeId));
}
