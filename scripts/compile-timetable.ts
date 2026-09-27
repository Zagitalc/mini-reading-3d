import {createHash} from 'node:crypto';
import {busBrands} from '../shared/bus-style';
import {fallbackColour} from '../shared/static-routes';
import {inBounds} from '../shared/geo';
import {parseGtfsTime,type BusStop,type StopIndex,type StopTimetable,type TimetableService} from '../shared/timetable';
import type {ServiceSummary,ServiceTrip} from '../shared/scheduled-services';
import {loopDestination,type LoopDestination} from './loop-destinations';
import type {LngLat,Place} from '../shared/types';
type Row=Record<string,string>;
/** Bump when compiled output changes for the same feed, so the scheduled refresh rebuilds and redeploys. */
export const TIMETABLE_COMPILER=4;
export const timetableVersion=(contentHash:string)=>createHash('sha256').update(`${contentHash}\0compiler ${TIMETABLE_COMPILER}`).digest('hex').slice(0,16);
export function compileTimetable(rows:(file:string)=>Row[],provenance:{source:string;sourceUrl:string;licence:string;retrievedAt:string},version:string,places:Place[]=[]){
 const agencies=rows('agency.txt'),zones=new Set(agencies.map(a=>a.agency_timezone));if(zones.size!==1||!zones.has('Europe/London'))throw Error('Expected one Europe/London timetable timezone');
 const routes=Object.fromEntries(rows('routes.txt').map(r=>[r.route_id,r]));
 const trips=new Map(rows('trips.txt').map(t=>[t.trip_id,t]));
 const frequencyTrips=new Set(rows('frequencies.txt').map(r=>r.trip_id));
 const services=new Map<string,TimetableService>();
 for(const r of rows('calendar.txt'))services.set(r.service_id,{start:r.start_date,end:r.end_date,weekdays:['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d=>r[d]).join(''),exceptions:{}});
 for(const r of rows('calendar_dates.txt')){if(!services.has(r.service_id))services.set(r.service_id,{start:r.date,end:r.date,weekdays:'0000000',exceptions:{}});const s=services.get(r.service_id)!;s.exceptions[r.date]=+r.exception_type as 1|2;}
 const stops=new Map<string,BusStop>();
 for(const s of rows('stops.txt'))if((!s.location_type||s.location_type==='0')&&inBounds([+s.stop_lon,+s.stop_lat]))stops.set(s.stop_id,{id:s.stop_id,name:s.stop_name,code:s.stop_code||s.stop_id,position:[+s.stop_lon,+s.stop_lat],routeIds:[]});
 const stopTimes=rows('stop_times.txt'),lastSequence=new Map<string,number>();
 for(const row of stopTimes){const sequence=Number(row.stop_sequence);if(!Number.isInteger(sequence)||sequence<0)throw Error(`Invalid stop sequence for ${row.trip_id}`);lastSequence.set(row.trip_id,Math.max(lastSequence.get(row.trip_id)??-1,sequence));}
 const loops=loopDestinations(rows('stops.txt'),stopTimes,places);
 const payloads=new Map<string,StopTimetable>(),tripIndexes=new Map<string,Map<string,number>>(),serviceIndexes=new Map<string,Map<string,number>>();
 let missingTimes=0;const usedServices=new Set<string>();
 // Each journey's first boarding and last call inside the map area, for the network-wide scheduled view.
 const spans=new Map<string,{startSequence:number;start:number;stopId:string;headsign:string;endSequence:number;end:number}>();
 for(const row of stopTimes){
  const stop=stops.get(row.stop_id);if(!stop)continue;const trip=trips.get(row.trip_id);if(!trip)throw Error(`Unknown trip ${row.trip_id}`);if(!routes[trip.route_id]||!services.has(trip.service_id))throw Error(`Missing route/calendar for ${trip.trip_id}`);
  if(!stop.routeIds.includes(trip.route_id))stop.routeIds.push(trip.route_id);usedServices.add(trip.service_id);
  // A terminal call has no onward boarding even when the publisher leaves pickup_type at its default.
  if(+row.stop_sequence===lastSequence.get(row.trip_id))continue;
  const seconds=parseGtfsTime(row.departure_time);if(seconds===undefined){missingTimes++;continue;}if(frequencyTrips.has(trip.trip_id))continue;
  if(!payloads.has(stop.id)){payloads.set(stop.id,{schema:1,stopId:stop.id,timezone:'Europe/London',services:[],trips:[],times:[]});tripIndexes.set(stop.id,new Map());serviceIndexes.set(stop.id,new Map());}
  const data=payloads.get(stop.id)!,tripMap=tripIndexes.get(stop.id)!,serviceMap=serviceIndexes.get(stop.id)!;
  if(!serviceMap.has(trip.service_id)){serviceMap.set(trip.service_id,data.services.length);data.services.push(services.get(trip.service_id)!);}
  if(!tripMap.has(trip.trip_id)){tripMap.set(trip.trip_id,data.trips.length);data.trips.push({id:trip.trip_id,service:serviceMap.get(trip.service_id)!,routeId:trip.route_id,headsign:trip.trip_headsign||routes[trip.route_id].route_long_name||'Destination not supplied',direction:trip.direction_id||''});}
  const headsign=headsignAt(row,loops.get(row.trip_id));
  data.times.push([tripMap.get(trip.trip_id)!,seconds,+row.stop_sequence,row.timepoint==='0'?1:0,+(row.pickup_type||0),...headsign] as typeof data.times[number]);
  if(row.pickup_type!=='1'){const existing=spans.get(trip.trip_id);
   if(!existing)spans.set(trip.trip_id,{startSequence:+row.stop_sequence,start:seconds,stopId:stop.id,headsign:headsign[0]??data.trips[tripMap.get(trip.trip_id)!].headsign,endSequence:-1,end:seconds});
   else if(+row.stop_sequence<existing.startSequence)Object.assign(existing,{startSequence:+row.stop_sequence,start:seconds,stopId:stop.id,headsign:headsign[0]??existing.headsign});}
 }
 // A journey ends at its last timed call in the map area, including the terminal (which has no boarding).
 for(const row of stopTimes){const span=spans.get(row.trip_id),call=parseGtfsTime(row.arrival_time||row.departure_time);if(span&&call!==undefined&&stops.has(row.stop_id)&&+row.stop_sequence>span.endSequence){span.endSequence=+row.stop_sequence;span.end=call;}}
 const summary:ServiceSummary={schema:1,version,timezone:'Europe/London',services:[],trips:[]},summaryServices=new Map<string,number>();
 for(const [tripId,span] of spans){const trip=trips.get(tripId)!;
  if(!summaryServices.has(trip.service_id)){summaryServices.set(trip.service_id,summary.services.length);summary.services.push(services.get(trip.service_id)!);}
  summary.trips.push([summaryServices.get(trip.service_id)!,trip.route_id,span.headsign,trip.direction_id||'',span.start,Math.max(span.start,span.end),span.stopId] satisfies ServiceTrip);}
 summary.trips.sort((a,b)=>a[4]-b[4]||a[1].localeCompare(b[1]));
 const usedRoutes=new Set<string>(),dates:string[]=[];
 for(const id of usedServices){const s=services.get(id)!;if(s.weekdays.includes('1'))dates.push(s.start,s.end);for(const[d,kind]of Object.entries(s.exceptions))if(kind===1)dates.push(d);}
 if(!dates.length)throw Error('No dated local bus services');dates.sort();
 const index:StopIndex={schema:1,...provenance,generatedAt:new Date().toISOString(),timezone:'Europe/London',validFrom:dates[0],validUntil:dates.at(-1)!,routes:{},stops:[],omitted:{missingTimes,frequencyTrips:frequencyTrips.size}};
 const files=new Map<string,StopTimetable>();
 for(const stop of stops.values()){if(!stop.routeIds.length)continue;stop.routeIds.sort();stop.routeIds.forEach(id=>usedRoutes.add(id));const data=payloads.get(stop.id);if(data){const file=createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0,20)+'.json';stop.timetableUrl=`/data/timetables/${version}/${file}`;files.set(file,data);}index.stops.push(stop);}
 for(const id of usedRoutes){const r=routes[id];index.routes[id]={label:r.route_short_name||r.route_long_name||id,colour:/^[a-f\d]{6}$/i.test(r.route_color)?`#${r.route_color}`:busBrands[r.route_short_name]?.[0]??fallbackColour(id)};}
 const summaryFile=`services-${createHash('sha256').update(JSON.stringify(summary)).digest('hex').slice(0,20)}.json`;index.servicesUrl=`/data/timetables/${version}/${summaryFile}`;
 index.stops.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));return {index,files,summary,summaryFile};
}
// A publisher's stop_headsign always wins; otherwise loop trips announce their far side until they turn.
function headsignAt(row:Row,loop?:LoopDestination):[string]|[]{const headsign=row.stop_headsign||(loop&&+row.stop_sequence<loop.beforeSequence?loop.label:'');return headsign?[headsign]:[];}
function loopDestinations(stopRows:Row[],stopTimes:Row[],places:Place[]){
 const result=new Map<string,LoopDestination>();if(!places.length)return result;
 const positions=new Map<string,LngLat>(stopRows.map(s=>[s.stop_id,[+s.stop_lon,+s.stop_lat]])),calls=new Map<string,{sequence:number;stopId:string}[]>();
 for(const row of stopTimes){if(!positions.has(row.stop_id))continue;if(!calls.has(row.trip_id))calls.set(row.trip_id,[]);calls.get(row.trip_id)!.push({sequence:+row.stop_sequence,stopId:row.stop_id});}
 // Trips on one route share a handful of stop patterns; resolve each pattern once.
 const patterns=new Map<string,LoopDestination|undefined>();
 for(const [trip,list] of calls){list.sort((a,b)=>a.sequence-b.sequence);const key=list.map(c=>`${c.sequence}:${c.stopId}`).join();
  if(!patterns.has(key))patterns.set(key,loopDestination(list.map(c=>({sequence:c.sequence,position:positions.get(c.stopId)!})),places));
  const loop=patterns.get(key);if(loop)result.set(trip,loop);}
 return result;
}
