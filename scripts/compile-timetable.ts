import {createHash} from 'node:crypto';
import {busBrands} from '../shared/bus-style';
import {fallbackColour} from '../shared/static-routes';
import {inBounds} from '../shared/geo';
import {parseGtfsTime,type BusStop,type StopIndex,type StopTimetable,type TimetableService} from '../shared/timetable';
type Row=Record<string,string>;
export function compileTimetable(rows:(file:string)=>Row[],provenance:{source:string;sourceUrl:string;licence:string;retrievedAt:string},version:string){
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
 const payloads=new Map<string,StopTimetable>(),tripIndexes=new Map<string,Map<string,number>>(),serviceIndexes=new Map<string,Map<string,number>>();
 let missingTimes=0;const usedServices=new Set<string>();
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
  data.times.push([tripMap.get(trip.trip_id)!,seconds,+row.stop_sequence,row.timepoint==='0'?1:0,+(row.pickup_type||0),...(row.stop_headsign?[row.stop_headsign]:[])] as typeof data.times[number]);
 }
 const usedRoutes=new Set<string>(),dates:string[]=[];
 for(const id of usedServices){const s=services.get(id)!;if(s.weekdays.includes('1'))dates.push(s.start,s.end);for(const[d,kind]of Object.entries(s.exceptions))if(kind===1)dates.push(d);}
 if(!dates.length)throw Error('No dated local bus services');dates.sort();
 const index:StopIndex={schema:1,...provenance,generatedAt:new Date().toISOString(),timezone:'Europe/London',validFrom:dates[0],validUntil:dates.at(-1)!,routes:{},stops:[],omitted:{missingTimes,frequencyTrips:frequencyTrips.size}};
 const files=new Map<string,StopTimetable>();
 for(const stop of stops.values()){if(!stop.routeIds.length)continue;stop.routeIds.sort();stop.routeIds.forEach(id=>usedRoutes.add(id));const data=payloads.get(stop.id);if(data){const file=createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0,20)+'.json';stop.timetableUrl=`/data/timetables/${version}/${file}`;files.set(file,data);}index.stops.push(stop);}
 for(const id of usedRoutes){const r=routes[id];index.routes[id]={label:r.route_short_name||r.route_long_name||id,colour:/^[a-f\d]{6}$/i.test(r.route_color)?`#${r.route_color}`:busBrands[r.route_short_name]?.[0]??fallbackColour(id)};}
 index.stops.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));return {index,files};
}
