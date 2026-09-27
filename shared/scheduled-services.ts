import {addDays,civilTime,serviceOrigin,serviceRuns,type StopIndex,type TimetableService} from './timetable';
// service index, route, destination at the first boarding stop, direction, first boarding and last call
// (seconds from the service-day origin), first boarding stop id.
export type ServiceTrip=[number,string,string,string,number,number,string];
/** One row per timed journey that boards passengers inside the map area, for network-wide scheduled views. */
export interface ServiceSummary {schema:1;version:string;timezone:string;services:TimetableService[];trips:ServiceTrip[]}
type Coverage=Pick<StopIndex,'validFrom'|'validUntil'|'timezone'>;
export interface ScheduledJourney {routeId:string;headsign:string;direction:string;origin:string;start:number;end:number;serviceDate:string}
export interface DestinationSummary {headsign:string;direction:string;remaining:number;last?:ScheduledJourney}
export interface RouteAtTime {
 routeId:string;
 /** Journeys between their first boarding and final call at the chosen moment. */
 running:number;
 /** Journeys that have not yet started and start before the night ends at 04:00. */
 remaining:number;
 state:'running'|'later'|'finished';
 /** The route's final journey start of this service night, whether or not it has already happened. */
 last:ScheduledJourney;
 next?:ScheduledJourney;
 destinations:DestinationSummary[];
}
export interface NetworkAtTime {
 serviceDate:string;at:number;nightStart:number;nightEnd:number;
 state:'covered'|'partial'|'uncovered';
 onRoad:number;routes:RouteAtTime[];
 /** Routes with journeys in the snapshot but none on this service night. */
 notRunning:string[];
}
const NIGHT_HOUR=4;
/** A clock time on a service night: times before 04:00 fall on the following calendar date. */
export function serviceNightTime(serviceDate:string,clock:string,timezone='Europe/London'){
 const [hour,minute]=clock.split(':').map(Number);
 return civilTime(hour<NIGHT_HOUR?addDays(serviceDate,1):serviceDate,hour,timezone,minute);
}
/** Every journey on the given service dates, as absolute instants, skipping dates outside the snapshot. */
function journeys(summary:ServiceSummary,index:Coverage,dates:string[]){
 const result:ScheduledJourney[]=[];
 for(const date of dates){
  if(date<index.validFrom||date>index.validUntil)continue;
  const origin=serviceOrigin(date,summary.timezone),running=summary.services.map(s=>serviceRuns(s,date));
  for(const [service,routeId,headsign,direction,start,end,stop] of summary.trips)if(running[service])result.push({routeId,headsign,direction,origin:stop,start:origin+start*1000,end:origin+end*1000,serviceDate:date});
 }
 return result;
}
/**
 * The scheduled network at one moment of a service night (04:00 to 04:00 London time). Journeys from
 * the previous and following service dates count when they overlap the night, so a 25:10 trip from the
 * night before and a 03:20 early trip both appear where a passenger would meet them.
 */
export function networkAt(summary:ServiceSummary,index:Coverage,serviceDate:string,clock:string):NetworkAtTime{
 const at=serviceNightTime(serviceDate,clock,index.timezone),nightStart=civilTime(serviceDate,NIGHT_HOUR,index.timezone),nightEnd=civilTime(addDays(serviceDate,1),NIGHT_HOUR,index.timezone);
 const covered=(date:string)=>date>=index.validFrom&&date<=index.validUntil;
 if(!covered(serviceDate))return {serviceDate,at,nightStart,nightEnd,state:'uncovered',onRoad:0,routes:[],notRunning:[]};
 const state=covered(addDays(serviceDate,-1))&&covered(addDays(serviceDate,1))?'covered':'partial';
 const all=journeys(summary,index,[addDays(serviceDate,-1),serviceDate,addDays(serviceDate,1)]);
 const night=all.filter(j=>j.start<nightEnd&&j.end>=nightStart).sort((a,b)=>a.start-b.start||a.end-b.end);
 const byRoute=new Map<string,ScheduledJourney[]>();
 for(const j of night){if(!byRoute.has(j.routeId))byRoute.set(j.routeId,[]);byRoute.get(j.routeId)!.push(j);}
 const routes:RouteAtTime[]=[];let onRoad=0;
 for(const [routeId,list] of byRoute){
  const running=list.filter(j=>j.start<=at&&at<j.end).length,upcoming=list.filter(j=>j.start>=at);onRoad+=running;
  const destinations=new Map<string,DestinationSummary>();
  for(const j of upcoming){const key=`${j.direction}\u0000${j.headsign}`,d=destinations.get(key)??{headsign:j.headsign,direction:j.direction,remaining:0};d.remaining++;d.last=j;destinations.set(key,d);}
  routes.push({routeId,running,remaining:upcoming.length,state:running?'running':upcoming.length?'later':'finished',last:list.at(-1)!,next:upcoming[0],destinations:[...destinations.values()].sort((a,b)=>b.last!.start-a.last!.start)});
 }
 const everyRoute=new Set(summary.trips.map(t=>t[1]));
 return {serviceDate,at,nightStart,nightEnd,state,onRoad,routes,notRunning:[...everyRoute].filter(id=>!byRoute.has(id))};
}
/** Scheduled journeys on the road through a service night, sampled every `step` minutes from `from` until 04:00. */
export function nightProfile(summary:ServiceSummary,index:Coverage,serviceDate:string,from='16:00',step=15){
 if(serviceDate<index.validFrom||serviceDate>index.validUntil)return [];
 const all=journeys(summary,index,[addDays(serviceDate,-1),serviceDate,addDays(serviceDate,1)]),points:{clock:string;at:number;journeys:number;routes:number}[]=[];
 const [h,m]=from.split(':').map(Number);
 for(let minutes=h*60+m;minutes<(24+NIGHT_HOUR)*60;minutes+=step){
  const clock=`${String(Math.floor(minutes/60)%24).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`,at=serviceNightTime(serviceDate,clock,index.timezone);
  const active=all.filter(j=>j.start<=at&&at<j.end);points.push({clock,at,journeys:active.length,routes:new Set(active.map(j=>j.routeId)).size});
 }
 return points;
}
