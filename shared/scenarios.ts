import {addDays,serviceOrigin,serviceRuns,type StopIndex} from './timetable';
import {serviceNightTime,type ServiceSummary} from './scheduled-services';
import type {RouteJourneys} from './live-departures';
import {alongLine} from './geo';
import type {LngLat} from './types';
/**
 * "What if" frequency scenarios: one route, one window of one service night, a new even interval between buses.
 * Everything under `today` is read from the bundled timetable. Everything under `scenario` follows from the
 * assumptions below, so it is arithmetic on the timetable, not a forecast of what the operator would run.
 */
export const ASSUMPTIONS={
 /** Turnaround at the end of each journey before the bus can work the next one: this share of the running time, */
 layoverShare:.1,
 /** but never less than this. */
 layoverMinSeconds:5*60,
} as const;
export const HEADWAY_LIMITS=[4,60] as const;
type Coverage=Pick<StopIndex,'validFrom'|'validUntil'|'timezone'>;
/** One timed journey with absolute call times (ms), as the timetable or the scenario has it. */
export interface PlannedJourney {direction:string;headsign:string;pattern:number;times:number[];scenario?:true}
export interface Waits {
 /** Buses leaving the reference stop inside the window. */
 departures:number;
 /** Average wait, in minutes, for someone arriving at the reference stop at a random moment in the window; NaN when no bus leaves after the window starts. */
 meanWait:number;
 /** Longest wait, in minutes, for anyone arriving in the window. */
 longestWait:number;
 /** From this moment to the end of the window no later bus leaves that night, so those arrivals are left out of the average. */
 noBusFrom?:number;
}
export interface DirectionOutcome {
 direction:string;headsign:string;
 /** The stop most of this direction's journeys call at; waits are measured there. */
 referenceStop:string;
 /** Median running time of the scenario's journeys in this direction, first to last call inside the map. */
 runMinutes:number;layoverMinutes:number;
 today:Waits;scenario:Waits;
}
export interface ScenarioInput {routeId:string;serviceDate:string;from:string;to:string;headwayMinutes:number}
export interface ScenarioResult {
 state:'ok'|'uncovered'|'no-service'|'invalid';
 input:ScenarioInput;start:number;end:number;
 directions:DirectionOutcome[];
 /** Most of the window's journeys on the road at once (no turnaround time). Buses still out from before the window are not counted. */
 onRoad:{today:number;scenario:number};
 /** Most buses the window's journeys need at once, counting each bus as busy until its turnaround ends. */
 vehicles:{today:number;scenario:number};
 /** Hours of timetabled running for the journeys that pass the reference stops inside the window. */
 serviceHours:{today:number;scenario:number};
 today:PlannedJourney[];scenario:PlannedJourney[];
}
const MINUTE=60_000;
const layover=(runMs:number)=>Math.max(ASSUMPTIONS.layoverMinSeconds*1000,runMs*ASSUMPTIONS.layoverShare);
/** Timetabled journeys of one route on the given service dates, joined to their call times by first stop, start and end. */
export function routeJourneysOn(summary:ServiceSummary,journeys:RouteJourneys,index:Coverage,dates:string[]){
 const byKey=new Map<string,RouteJourneys['trips']>();
 for(const trip of journeys.trips){const times=trip[2],key=`${journeys.patterns[trip[1]]?.stops[0]}|${times[0]}|${times.at(-1)}`;if(!byKey.has(key))byKey.set(key,[]);byKey.get(key)!.push(trip);}
 const result:PlannedJourney[]=[];
 for(const date of dates){
  if(date<index.validFrom||date>index.validUntil)continue;
  const origin=serviceOrigin(date,summary.timezone),running=summary.services.map(s=>serviceRuns(s,date)),used=new Map<string,number>();
  for(const [service,routeId,headsign,direction,start,end,stop] of summary.trips){
   if(routeId!==journeys.routeId||!running[service])continue;
   // Identical first stop, start and end can repeat across calendars; each running copy takes the next file trip.
   const key=`${stop}|${start}|${end}`,n=used.get(key)??0,trip=byKey.get(key)?.[n];used.set(key,n+1);if(!trip)continue;
   result.push({direction,headsign,pattern:trip[1],times:trip[2].map(s=>origin+s*1000)});
  }
 }
 return result.sort((a,b)=>a.times[0]-b.times[0]);
}
/** Waits at one stop for arrivals spread evenly over [start, end). `departures` must be sorted and may run past `end`. */
export function waits(departures:number[],start:number,end:number):Waits{
 let at=start,covered=0,total=0,longest=0,count=0;
 for(const d of departures){
  if(d<start)continue;if(d<end)count++;
  if(at<end&&d>at){const until=Math.min(d,end),span=until-at;total+=span*((d-at)+(d-until))/2;covered+=span;longest=Math.max(longest,d-at);at=d;}
 }
 return {departures:count,meanWait:covered?total/covered/MINUTE:NaN,longestWait:covered?longest/MINUTE:NaN,...(at<end?{noBusFrom:at}:{})};
}
const callAt=(journeys:RouteJourneys,j:PlannedJourney,stop:string)=>{const i=journeys.patterns[j.pattern].stops.indexOf(stop);return i<0?undefined:j.times[i];};
/** Most intervals open at any one moment inside [start, end). */
function peak(intervals:[number,number][],start:number,end:number){
 const edges:[number,number][]=[];
 for(const [a,b] of intervals){const from=Math.max(a,start),to=Math.min(b,end);if(from<to)edges.push([from,1],[to,-1]);}
 edges.sort((x,y)=>x[0]-y[0]||x[1]-y[1]);let open=0,most=0;for(const [,step] of edges){open+=step;most=Math.max(most,open);}return most;
}
const occupied=(list:PlannedJourney[],turnaround:boolean)=>list.map(j=>{const run=j.times.at(-1)!-j.times[0];return [j.times[0],j.times.at(-1)!+(turnaround?layover(run):0)] as [number,number];});
const hours=(list:PlannedJourney[])=>list.reduce((sum,j)=>sum+j.times.at(-1)!-j.times[0],0)/3_600_000;
/**
 * Replace every journey of a route that passes its reference stop inside the window with full-length journeys at
 * an even interval, keep the rest of the night as timetabled, and compare. Running times, stops and route stay as
 * they are today (no rerouting); only the timing of departures changes.
 */
export function frequencyScenario(summary:ServiceSummary,journeys:RouteJourneys,index:Coverage,input:ScenarioInput):ScenarioResult{
 const start=serviceNightTime(input.serviceDate,input.from,index.timezone),end=serviceNightTime(input.serviceDate,input.to,index.timezone);
 const empty=(state:ScenarioResult['state']):ScenarioResult=>({state,input,start,end,directions:[],onRoad:{today:0,scenario:0},vehicles:{today:0,scenario:0},serviceHours:{today:0,scenario:0},today:[],scenario:[]});
 const headway=input.headwayMinutes*MINUTE;
 if(!(end>start)||!(input.headwayMinutes>=HEADWAY_LIMITS[0]&&input.headwayMinutes<=HEADWAY_LIMITS[1]))return empty('invalid');
 if(input.serviceDate<index.validFrom||input.serviceDate>index.validUntil)return empty('uncovered');
 const night=routeJourneysOn(summary,journeys,index,[addDays(input.serviceDate,-1),input.serviceDate,addDays(input.serviceDate,1)]);
 const directions=[...new Set(night.filter(j=>j.times[0]<end+6*3_600_000&&j.times.at(-1)!>start-6*3_600_000).map(j=>j.direction))].sort();
 if(!directions.length)return empty('no-service');
 const replaced=new Set<PlannedJourney>(),added:PlannedJourney[]=[],outcomes:DirectionOutcome[]=[];
 for(const direction of directions){
  const own=night.filter(j=>j.direction===direction),inWindow=own.filter(j=>j.times[0]<end&&j.times.at(-1)!>=start),pool=inWindow.length?inWindow:own;
  // Reference stop: the stop most of the window's journeys in this direction call at.
  const calls=new Map<string,number>();for(const j of pool)for(const stop of new Set(journeys.patterns[j.pattern].stops))calls.set(stop,(calls.get(stop)??0)+1);
  const referenceStop=[...calls].sort((a,b)=>b[1]-a[1])[0][0];
  const departures=own.map(j=>({j,at:callAt(journeys,j,referenceStop)})).filter((d):d is {j:PlannedJourney;at:number}=>d.at!==undefined).sort((a,b)=>a.at-b.at);
  const windowed=departures.filter(d=>d.at>=start&&d.at<end);windowed.forEach(d=>replaced.add(d.j));
  // Template: the commonest calling pattern that reaches the reference stop. Each new journey copies the
  // running times of today's journey on that pattern that passes the reference stop nearest in time.
  const candidates=(windowed.length?windowed:departures).map(d=>d.j),counts=new Map<number,number>();for(const j of candidates)counts.set(j.pattern,(counts.get(j.pattern)??0)+1);
  const pattern=[...counts].sort((a,b)=>b[1]-a[1]||journeys.patterns[b[0]].stops.length-journeys.patterns[a[0]].stops.length)[0][0];
  const referenceIndex=journeys.patterns[pattern].stops.indexOf(referenceStop),templates=departures.filter(d=>d.j.pattern===pattern);
  // The even timetable keeps today's first departure in the window, so the comparison is not about phase.
  const first=windowed.length&&windowed[0].at<=start+headway?windowed[0].at:start,planned:number[]=[],runs:number[]=[];
  for(let at=first;at<end;at+=headway){
   const template=templates.reduce((a,b)=>Math.abs(b.at-at)<Math.abs(a.at-at)?b:a).j,offset=template.times[referenceIndex];
   planned.push(at);runs.push(template.times.at(-1)!-template.times[0]);
   added.push({direction,headsign:template.headsign,pattern,times:template.times.map(t=>at-offset+t),scenario:true});
  }
  const after=departures.filter(d=>d.at>=end).map(d=>d.at),run=runs.length?runs.sort((a,b)=>a-b)[Math.floor((runs.length-1)/2)]:0;
  outcomes.push({direction,headsign:(windowed[0]??departures[0]).j.headsign,referenceStop,runMinutes:run/MINUTE,layoverMinutes:layover(run)/MINUTE,
   today:waits(departures.map(d=>d.at),start,end),scenario:waits([...planned,...after],start,end)});
 }
 const kept=night.filter(j=>!replaced.has(j)),today=night.filter(j=>j.times[0]<end&&j.times.at(-1)!>start),scenario=[...kept,...added].sort((a,b)=>a.times[0]-b.times[0]);
 return {state:'ok',input,start,end,directions:outcomes,
  onRoad:{today:peak(occupied([...replaced],false),start,end),scenario:peak(occupied(added,false),start,end)},
  vehicles:{today:peak(occupied([...replaced],true),start,end),scenario:peak(occupied(added,true),start,end)},
  serviceHours:{today:hours([...replaced]),scenario:hours(added)},
  today,scenario:scenario.filter(j=>j.times[0]<end&&j.times.at(-1)!>start)};
}
/** Where a journey's bus is at `at`, moving at an even speed between calls; undefined when it is not on the road. */
export function positionAt(journeys:RouteJourneys,j:PlannedJourney,at:number):LngLat|undefined{
 const pattern=journeys.patterns[j.pattern],shape=journeys.shapes[pattern?.shape];if(!pattern||!shape||shape.length<2)return undefined;
 const t=j.times;if(at<t[0]||at>t.at(-1)!)return undefined;
 for(let i=1;i<t.length;i++)if(at<=t[i]){const span=t[i]-t[i-1],f=span>0?(at-t[i-1])/span:1;return alongLine(shape,pattern.along[i-1]+f*(pattern.along[i]-pattern.along[i-1]));}
 return alongLine(shape,pattern.along.at(-1)!);
}
