import {distance,alongLine,toLocal} from '../shared/geo';
import type {LngLat} from '../shared/types';
type Row=Record<string,string>;
export interface ReferenceShape {routeLabel:string;line:LngLat[]}
export interface DerivedShapes {shapes:Record<string,LngLat[]>;tripShapes:Map<string,string>;reused:number;straight:number}

// Stops must lie this close to a reference shape, in running order, for its road geometry to be reused.
const MAX_STOP_OFFSET=60,SEARCH_AHEAD=150,BACKTRACK=20,TIE=5;

function section(line:LngLat[],from:number,to:number):LngLat[]{
 const out:LngLat[]=[alongLine(line,from)];let run=0;
 for(let i=1;i<line.length;i++){run+=distance(line[i-1],line[i]);if(run>from&&run<to)out.push(line[i]);}
 out.push(alongLine(line,to));return out;
}

// Walk the line forwards, matching each stop to the first stretch that passes within reach of it. A global
// nearest point would jump between the two carriageways of out-and-back sections and between loop passes.
function fit(stops:LngLat[],line:LngLat[]){
 const pts=line.map(toLocal),cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
 let segment=1,previous=-Infinity,total=0;const along:number[]=[];
 for(const stop of stops){
  const q=toLocal(stop);let best:{d:number;along:number;segment:number}|undefined;
  for(let i=Math.max(1,segment);i<pts.length;i++){
   const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),t=len?Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/(len*len))):0,d=Math.hypot(q[0]-a[0]-dx*t,q[1]-a[1]-dy*t);
   const at=cum[i-1]+len*t;
   if(d<=MAX_STOP_OFFSET&&at>=previous-BACKTRACK&&(!best||d<best.d))best={d,along:at,segment:i};
   // Stop searching once well past the first close approach.
   if(best&&cum[i-1]>best.along+SEARCH_AHEAD)break;
  }
  if(!best)return undefined;
  segment=best.segment;previous=best.along;along.push(best.along);total+=best.d;
 }
 return {mean:total/stops.length,from:along[0],to:along.at(-1)!};
}

/**
 * BODS GTFS converted from TransXChange can omit shapes.txt. Give each stop pattern road geometry by
 * reusing a previously published shape that serves the same stops in order; only when none fits,
 * fall back to straight lines between stops, which the counts make visible.
 */
export function deriveShapes(trips:Row[],routes:Row[],stopTimes:Row[],stops:Row[],reference:ReferenceShape[]):DerivedShapes{
 const position=new Map(stops.map(s=>[s.stop_id,[+s.stop_lon,+s.stop_lat] as LngLat]));
 const label=new Map(routes.map(r=>[r.route_id,r.route_short_name||r.route_long_name]));
 const calls=new Map<string,Row[]>();
 for(const row of stopTimes){if(!calls.has(row.trip_id))calls.set(row.trip_id,[]);calls.get(row.trip_id)!.push(row);}
 const shapes:Record<string,LngLat[]>={},tripShapes=new Map<string,string>(),patterns=new Map<string,string>();let reused=0,straight=0;
 for(const trip of trips){
  const sequence=(calls.get(trip.trip_id)??[]).sort((a,b)=>+a.stop_sequence-+b.stop_sequence).map(c=>c.stop_id).filter(id=>position.has(id));
  if(sequence.length<2)continue;
  const routeLabel=label.get(trip.route_id)??'',key=`${routeLabel}|${sequence.join('>')}`;
  let id=patterns.get(key);
  if(!id){
   id=`derived:${patterns.size+1}`;patterns.set(key,id);
   const points=sequence.map(s=>position.get(s)!);
   let best:{mean:number;line:LngLat[];from:number;to:number}|undefined;
   for(const candidates of [reference.filter(r=>r.routeLabel===routeLabel),reference]){
    // Several shapes can pass every stop (branches, detours); among equally close fits take the shortest,
    // since a detour between two stops is the likelier mismatch.
    const fits=candidates.flatMap(r=>{const f=fit(points,r.line);return f&&f.to>f.from?[{...f,line:r.line}]:[];});
    const closest=Math.min(...fits.map(f=>f.mean));
    best=fits.filter(f=>f.mean<=closest+TIE).sort((a,b)=>(a.to-a.from)-(b.to-b.from))[0];
    if(best)break;
   }
   if(best){shapes[id]=section(best.line,best.from,best.to);reused++;}else{shapes[id]=points;straight++;}
  }
  tripShapes.set(trip.trip_id,id);
 }
 return {shapes,tripShapes,reused,straight};
}
