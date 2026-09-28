import {nearestOnLine,lineLength,distance} from './geo';
import {serviceOrigin,type Departure} from './timetable';
import type {LngLat,VehicleObservation} from './types';

/** Calls of one stop pattern inside the map area, with each stop's distance along the pattern's shape. */
export interface JourneyPattern {shape:number;stops:string[];sequences:number[];along:number[]}
// trip id, pattern index, and the departure time at each call of the pattern (seconds from the service-day origin).
export type JourneyTrip=[string,number,number[]];
/** Per-route journey geometry and timings, compiled with the timetable, used to judge live buses against it. */
export interface RouteJourneys {schema:1;version:string;routeId:string;timezone:string;shapes:LngLat[][];patterns:JourneyPattern[];trips:JourneyTrip[]}

/** Positions older than this are not used for a live estimate. */
export const LIVE_MAX_AGE_MS=180_000;
/** A bus further than this from its journey's road geometry is not trusted for an estimate. */
export const LIVE_MAX_OFFSET_M=60;
/** Delays outside this range usually mean the wrong journey, not a very late bus. On 28 September 2026 the live
 * feed put 44 of 48 matched buses between two minutes early and five late; the two outliers were a bus reported
 * an hour late at the end of a loop and one standing ten minutes early at its first stop. */
export const LIVE_DELAY_RANGE_S=[-10*60,30*60] as const;

export const liveKey=(d:Pick<Departure,'tripId'|'serviceDate'|'sequence'>)=>`${d.tripId}|${d.serviceDate}|${d.sequence}`;
export interface LiveEstimate {
 tripId:string;sequence:number;
 /** Estimated departure from this stop: the scheduled time shifted by the bus's current delay. */
 expected:number;scheduled:number;delaySeconds:number;
 vehicleId:string;observedAt:string;
 /** The bus has already passed this stop. */
 passed:boolean;
}
export type LiveStatus=
 {state:'estimate';estimate:LiveEstimate}|
 {state:'none';reason:'no-journey-data'|'not-tracked'|'ambiguous'|'off-route'|'stale'};

/** Seconds through the service day at which the timetable puts the bus at `along` metres. */
function scheduledAt(pattern:JourneyPattern,times:number[],along:number){
 const a=pattern.along;
 if(along<=a[0])return times[0];
 for(let i=1;i<a.length;i++)if(along<=a[i]){const span=a[i]-a[i-1];return times[i-1]+(span>0?(along-a[i-1])/span:1)*(times[i]-times[i-1]);}
 return times.at(-1)!;
}

/** Every stretch of the line within `limit` metres of the point, each as its closest point. */
function nearbyPositions(point:LngLat,line:LngLat[],limit:number){
 const result:number[]=[];let run=0,best:{d:number;along:number}|undefined;
 for(let i=1;i<line.length;i++){
  const segment=[line[i-1],line[i]],near=nearestOnLine(point,segment),length=lineLength(segment);
  if(near.distance<=limit){if(!best||near.distance<best.d)best={d:near.distance,along:run+near.along};}
  else if(best){result.push(best.along);best=undefined;}
  run+=length;
 }
 if(best)result.push(best.along);
 return result;
}

/**
 * Where a bus is on its journey and how late it is running, judged only from its reported position against
 * that journey's own timetable. A loop can pass the same street twice, so the reading that implies the
 * smallest delay is taken. Returns undefined when the bus is not on the journey's road.
 */
export function journeyProgress(o:Pick<VehicleObservation,'position'|'observedAt'>,journeys:RouteJourneys,trip:JourneyTrip,serviceDate:string){
 const pattern=journeys.patterns[trip[1]],shape=pattern&&journeys.shapes[pattern.shape],times=trip[2];
 if(!pattern||!shape||shape.length<2||pattern.along.length<2)return undefined;
 const origin=serviceOrigin(serviceDate,journeys.timezone),observed=Date.parse(o.observedAt);
 let best:{along:number;delaySeconds:number}|undefined;
 for(const along of nearbyPositions(o.position,shape,LIVE_MAX_OFFSET_M)){
  if(along<pattern.along[0]-LIVE_MAX_OFFSET_M||along>pattern.along.at(-1)!+LIVE_MAX_OFFSET_M)continue;
  let delaySeconds=Math.round((observed-origin)/1000-scheduledAt(pattern,times,along));
  // A bus standing at its first call here cannot be early: it waits there for its departure time.
  if(along<=pattern.along[0]+LIVE_MAX_OFFSET_M)delaySeconds=Math.max(0,delaySeconds);
  if(delaySeconds<LIVE_DELAY_RANGE_S[0]||delaySeconds>LIVE_DELAY_RANGE_S[1])continue;
  if(!best||Math.abs(delaySeconds)<Math.abs(best.delaySeconds))best={along,delaySeconds};
 }
 return best;
}

const sameLabel=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
const readingOperator=(o:VehicleObservation)=>!o.operatorId||/^(RGB|RBUS|READING)$/i.test(o.operatorId);

/**
 * Whether a live bus is running this timetabled journey. Only the GTFS-RT trip reference counts, and the
 * bus must also report the same route number; Reading Buses' SIRI-VM journey codes and first stops do not
 * identify a journey on their own (checked against the live feed on 28 September 2026).
 */
export function runsJourney(o:VehicleObservation,routeLabel:string,trip:JourneyTrip){
 return o.kind==='bus'&&readingOperator(o)&&sameLabel(o.label,routeLabel)&&o.timetableTripId===trip[0];
}

/**
 * Live estimates for scheduled departures at one stop. A departure gets an estimate only when exactly one
 * fresh bus reports running that journey, that bus is running no other listed journey, and its position lies on
 * the journey's road. Everything else keeps its scheduled time, with the reason recorded.
 */
export function liveDepartures(departures:Departure[],vehicles:VehicleObservation[],journeysByRoute:Map<string,RouteJourneys>,routeLabel:(routeId:string)=>string,now=Date.now()){
 const result=new Map<string,LiveStatus>(),key=liveKey;
 const trips=new Map<string,Map<string,JourneyTrip>>();
 for(const [routeId,journeys] of journeysByRoute)trips.set(routeId,new Map(journeys.trips.map(t=>[t[0],t])));
 const claims=new Map<string,VehicleObservation[]>(),vehicleClaims=new Map<string,number>();
 const journeyKey=(d:Departure)=>`${d.tripId}|${d.serviceDate}`,seen=new Set<string>();
 for(const d of departures){
  const journeys=journeysByRoute.get(d.routeId),trip=trips.get(d.routeId)?.get(d.tripId);
  if(!journeys||!trip){result.set(key(d),{state:'none',reason:'no-journey-data'});continue;}
  if(seen.has(journeyKey(d)))continue;seen.add(journeyKey(d));
  const matches=vehicles.filter(vehicle=>runsJourney(vehicle,routeLabel(d.routeId),trip));
  claims.set(journeyKey(d),matches);
  for(const vehicle of matches)vehicleClaims.set(vehicle.id,(vehicleClaims.get(vehicle.id)??0)+1);
 }
 for(const d of departures){
  if(result.has(key(d)))continue;
  const matches=claims.get(journeyKey(d))??[];
  if(!matches.length){result.set(key(d),{state:'none',reason:'not-tracked'});continue;}
  if(matches.length>1||vehicleClaims.get(matches[0].id)!==1){result.set(key(d),{state:'none',reason:'ambiguous'});continue;}
  const vehicle=matches[0];
  if(now-Date.parse(vehicle.observedAt)>LIVE_MAX_AGE_MS){result.set(key(d),{state:'none',reason:'stale'});continue;}
  const journeys=journeysByRoute.get(d.routeId)!,trip=trips.get(d.routeId)!.get(d.tripId)!,pattern=journeys.patterns[trip[1]];
  const call=pattern.sequences.indexOf(d.sequence),progress=call<0?undefined:journeyProgress(vehicle,journeys,trip,d.serviceDate);
  if(!progress){result.set(key(d),{state:'none',reason:'off-route'});continue;}
  const passed=progress.along>pattern.along[call]+20;
  result.set(key(d),{state:'estimate',estimate:{tripId:d.tripId,sequence:d.sequence,scheduled:d.time,expected:passed?d.time+progress.delaySeconds*1000:Math.max(d.time+progress.delaySeconds*1000,now),delaySeconds:progress.delaySeconds,vehicleId:vehicle.id,observedAt:vehicle.observedAt,passed}});
 }
 return result;
}

/** "3 min late", "on time" or "2 min early"; within a minute either way counts as on time. */
export function delayLabel(seconds:number){
 const minutes=Math.round(Math.abs(seconds)/60);
 return minutes<1?'on time':`${minutes} min ${seconds>0?'late':'early'}`;
}
/** Countdown text for an estimated departure. */
export function countdown(expected:number,now=Date.now()){
 const minutes=Math.floor((expected-now)/60000);
 return minutes<1?'Due':`${minutes} min`;
}

// Stop positions on a pattern's shape: the first close approach after the previous stop, so loops that pass
// the same street twice keep their order.
export function stopDistances(stops:LngLat[],shape:LngLat[]){
 const result:number[]=[];let from=0;
 for(const stop of stops){
  const positions=nearbyPositions(stop,shape,40).filter(a=>a>=from-5);
  const along=positions.length?positions[0]:Math.max(from,nearestAfter(stop,shape,from));
  result.push(Math.round(along));from=along;
 }
 return result;
}
function nearestAfter(point:LngLat,line:LngLat[],from:number){
 let run=0,best={d:Infinity,along:from};
 for(let i=1;i<line.length;i++){const length=distance(line[i-1],line[i]);if(run+length>=from){const near=nearestOnLine(point,[line[i-1],line[i]]);const along=run+near.along;if(along>=from&&near.distance<best.d)best={d:near.distance,along};}run+=length;}
 return best.along;
}
