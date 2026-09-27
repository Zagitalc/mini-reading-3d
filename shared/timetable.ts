import type {LngLat} from './types';
export interface TimetableService {start:string;end:string;weekdays:string;exceptions:Record<string,1|2>}
export interface TimetableTrip {id:string;service:number;routeId:string;headsign:string;direction:string}
// trip index, seconds from service-day origin, stop sequence, approximate time, pickup type, optional stop headsign.
export type StopTime=[number,number,number,0|1,number,string?];
export interface StopTimetable {schema:1;stopId:string;timezone:string;services:TimetableService[];trips:TimetableTrip[];times:StopTime[]}
export interface BusStop {id:string;name:string;code:string;position:LngLat;routeIds:string[];timetableUrl?:string}
export interface StopIndex {schema:1;version?:string;feedInfo?:{version?:string;startDate?:string;endDate?:string};source:string;sourceUrl:string;licence:string;retrievedAt:string;generatedAt:string;timezone:string;validFrom:string;validUntil:string;routes:Record<string,{label:string;colour:string}>;stops:BusStop[];servicesUrl?:string;omitted:{missingTimes:number;frequencyTrips:number}}
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

export function timetableStatus(index:Pick<StopIndex,'validFrom'|'validUntil'|'timezone'>,now=Date.now()){
 const today=localDate(now,index.timezone);
 const date=(s:string)=>Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8));
 const days=Math.round((date(index.validUntil)-date(today))/86400000);
 return {days,state:today<index.validFrom?'future':days<0?'expired':days<=3?'expiring':'current'} as const;
}

export interface TonightDepartures {
 start:number;
 end:number;
 departures:Departure[];
 state:'current'|'partial'|'expired'|'future';
 /** Routes with a departure after midnight in this window; not evidence of an all-night service. */
 afterMidnightRouteIds:string[];
}

/** Resolve a civil clock time independently of GTFS's elapsed service-day times. */
export function civilTime(date:string,hour:number,timezone:string,minute=0){
 const target=Date.UTC(+date.slice(0,4),+date.slice(4,6)-1,+date.slice(6,8),hour,minute);let result=target;
 for(let i=0;i<4;i++){
  const p=parts(result,timezone),represented=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  const correction=target-represented;if(!correction)break;result+=correction;
 }
 return result;
}

/**
 * Upcoming scheduled departures before the next local 04:00, with an exclusive cutoff.
 * Before 04:00 this is the remainder of the current night; at 04:00 a new window begins.
 * Coverage is conservative: an expired/future feed cannot establish today's departures.
 * Partial coverage keeps known trips (including valid service-day times above 24:00),
 * but cannot establish whether further trips run on the uncovered calendar date.
 * The final item is only the final departure in this window, never a last-bus claim.
 */
export function tonightDepartures(data:StopTimetable,index:Pick<StopIndex,'validFrom'|'validUntil'|'timezone'>,now=Date.now()):TonightDepartures{
 const today=localDate(now,index.timezone),hour=+parts(now,index.timezone).hour;
 const cutoffDate=hour<4?today:addDays(today,1),end=civilTime(cutoffDate,4,index.timezone);
 const state:TonightDepartures['state']=today<index.validFrom?'future':today>index.validUntil?'expired':localDate(end-1,index.timezone)>index.validUntil?'partial':'current';
 if(state==='future'||state==='expired')return {start:now,end,departures:[],state,afterMidnightRouteIds:[]};
 const departures=scheduledDepartures(data,now,(end-now)/3600000,Infinity)
  .filter(departure=>departure.serviceDate>=index.validFrom&&departure.serviceDate<=index.validUntil);
 const afterMidnightRouteIds=[...new Set(departures.filter(departure=>localDate(departure.time,index.timezone)===cutoffDate).map(departure=>departure.routeId))];
 return {start:now,end,departures,state,afterMidnightRouteIds};
}

/** The service day a passenger means by "tonight": before local 04:00 it is still the previous day. */
export function currentServiceDate(now=Date.now(),timezone='Europe/London'){const today=localDate(now,timezone);return +parts(now,timezone).hour<4?addDays(today,-1):today;}

/** Every boarding departure attached to one GTFS service date, independent of any viewing window. */
export function serviceDayDepartures(data:StopTimetable,date:string):Departure[]{
 const origin=serviceOrigin(date,data.timezone),running=data.services.map(s=>serviceRuns(s,date)),result:Departure[]=[];
 for(const [tripIndex,seconds,sequence,approximate,pickupType,headsign] of data.times){const trip=data.trips[tripIndex];if(!running[trip.service]||pickupType===1)continue;result.push({tripId:trip.id,routeId:trip.routeId,headsign:headsign||trip.headsign,direction:trip.direction,sequence,time:origin+seconds*1000,serviceDate:date,approximate:!!approximate,pickupType});}
 return result.sort((a,b)=>a.time-b.time||a.tripId.localeCompare(b.tripId)||a.sequence-b.sequence);
}

export interface LastDeparture {
 routeId:string;direction:string;headsign:string;
 /** Final boarding departure for this route, direction and destination on the service date. */
 last:Departure;
 /** Scheduled boarding departures for this group on the service date. */
 count:number;
 /** The last departure falls on the following calendar date (a GTFS time of 24:00 or later). */
 afterMidnight:boolean;
 /** First departure for the same group on the following service date, when that date is covered. */
 next?:Departure;
}
export interface LastDepartures {serviceDate:string;state:'covered'|'uncovered';nextCovered:boolean;groups:LastDeparture[]}

/**
 * Last scheduled departures per route, direction and destination for one service date, computed
 * from the whole timetable rather than a finite window. A departure at 24:30 stays attached to the
 * service date it belongs to. The following day's first departure is included because an early
 * service (for example 03:20) can be the next bus even though it belongs to another service date.
 */
export function lastDepartures(data:StopTimetable,index:Pick<StopIndex,'validFrom'|'validUntil'|'timezone'>,serviceDate:string):LastDepartures{
 const covered=(date:string)=>date>=index.validFrom&&date<=index.validUntil,nextDate=addDays(serviceDate,1);
 if(!covered(serviceDate))return {serviceDate,state:'uncovered',nextCovered:covered(nextDate),groups:[]};
 const key=(d:Departure)=>`${d.routeId}\u0000${d.direction}\u0000${d.headsign}`,groups=new Map<string,LastDeparture>();
 for(const departure of serviceDayDepartures(data,serviceDate)){const group=groups.get(key(departure));
  if(group){group.last=departure;group.count++;}else groups.set(key(departure),{routeId:departure.routeId,direction:departure.direction,headsign:departure.headsign,last:departure,count:1,afterMidnight:false});}
 if(covered(nextDate))for(const departure of serviceDayDepartures(data,nextDate)){const group=groups.get(key(departure));if(group&&!group.next)group.next=departure;}
 for(const group of groups.values())group.afterMidnight=localDate(group.last.time,index.timezone)>serviceDate;
 return {serviceDate,state:'covered',nextCovered:covered(nextDate),groups:[...groups.values()]};
}

/** Order route labels as people read them: 2, 2a, 14, 17, X4, then anything else. */
export function compareRouteLabels(a:string,b:string){return a.localeCompare(b,'en-GB',{numeric:true,sensitivity:'base'});}
