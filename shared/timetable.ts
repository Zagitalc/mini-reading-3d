import type {LngLat} from './types';
export interface TimetableService {start:string;end:string;weekdays:string;exceptions:Record<string,1|2>}
export interface TimetableTrip {id:string;service:number;routeId:string;headsign:string;direction:string}
// trip index, seconds from service-day origin, stop sequence, approximate time, pickup type, optional stop headsign.
export type StopTime=[number,number,number,0|1,number,string?];
export interface StopTimetable {schema:1;stopId:string;timezone:string;services:TimetableService[];trips:TimetableTrip[];times:StopTime[]}
export interface BusStop {id:string;name:string;code:string;position:LngLat;routeIds:string[];timetableUrl?:string}
export interface StopIndex {schema:1;source:string;sourceUrl:string;licence:string;retrievedAt:string;generatedAt:string;timezone:string;validFrom:string;validUntil:string;routes:Record<string,{label:string;colour:string}>;stops:BusStop[];omitted:{missingTimes:number;frequencyTrips:number}}
export interface Departure {tripId:string;routeId:string;headsign:string;direction:string;sequence:number;time:number;serviceDate:string;approximate:boolean;pickupType:number}
const formatters=new Map<string,Intl.DateTimeFormat>();
function formatter(timezone:string){let f=formatters.get(timezone);if(!f){f=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});formatters.set(timezone,f);}return f;}
function parts(ms:number,timezone:string){return Object.fromEntries(formatter(timezone).formatToParts(ms).map(p=>[p.type,p.value]));}
export function localDate(ms:number,timezone='Europe/London'){const p=parts(ms,timezone);return p.year+p.month+p.day;}
export function addDays(date:string,days:number){return new Date(Date.UTC(+date.slice(0,4),+date.slice(4,6)-1,+date.slice(6,8)+days)).toISOString().slice(0,10).replaceAll('-','');}
/** GTFS times are elapsed from local noon minus 12 hours, including DST transition days. */
export function serviceOrigin(date:string,timezone='Europe/London') {
 const utcNoon=Date.UTC(+date.slice(0,4),+date.slice(4,6)-1,+date.slice(6,8),12);let noon=utcNoon;
 for(let i=0;i<3;i++){const p=parts(noon,timezone);const represented=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);noon+=utcNoon-represented;}
 return noon-12*3600000;
}
export function serviceRuns(service:TimetableService,date:string){const exception=service.exceptions[date];if(exception)return exception===1;if(date<service.start||date>service.end)return false;const day=new Date(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T12:00:00Z`).getUTCDay();return service.weekdays[(day+6)%7]==='1';}
export function parseGtfsTime(value:string){const match=/^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(value);return match?+match[1]*3600 + +match[2]*60 + +match[3]:undefined;}
export function scheduledDepartures(data:StopTimetable,now=Date.now(),hours=24,limit=12):Departure[]{
 const end=now+hours*3600000,today=localDate(now,data.timezone),maxSeconds=Math.max(0,...data.times.map(t=>t[1])),lookBack=Math.ceil(maxSeconds/86400)+1;
 const result:Departure[]=[];
 for(let offset=-lookBack;offset<=Math.ceil(hours/24)+1;offset++){
  const date=addDays(today,offset),origin=serviceOrigin(date,data.timezone),running=data.services.map(s=>serviceRuns(s,date));
  for(const [tripIndex,seconds,sequence,approximate,pickupType,headsign] of data.times){const trip=data.trips[tripIndex];if(!running[trip.service]||pickupType===1)continue;const time=origin+seconds*1000;if(time<now||time>=end)continue;result.push({tripId:trip.id,routeId:trip.routeId,headsign:headsign||trip.headsign,direction:trip.direction,sequence,time,serviceDate:date,approximate:!!approximate,pickupType});}
 }
 return result.sort((a,b)=>a.time-b.time||a.tripId.localeCompare(b.tripId)||a.sequence-b.sequence).slice(0,limit);
}
export function timetableExpired(index:Pick<StopIndex,'validUntil'|'timezone'>,now=Date.now()){return localDate(now,index.timezone)>index.validUntil;}
