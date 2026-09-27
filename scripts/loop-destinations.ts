import {distance} from '../shared/geo';
import type {LngLat,Place} from '../shared/types';
export interface TripCall {sequence:number;position:LngLat}
export interface LoopDestination {label:string;beforeSequence:number}
// A trip that finishes within this distance of where it started is a loop (town-centre stands sit this close together).
export const LOOP_CLOSE_METRES=500;
// Shorter loops are town-centre shuttles; there is no far side worth naming.
export const LOOP_MIN_REACH_METRES=1500;
const AREA_KINDS=new Set(['town','suburb','village']);
/**
 * GTFS labels a loop trip by its final stop, so a bus leaving Reading for Woodley and back reads
 * "Reading Station" from the first stop. Operators show the far side of the loop until the bus turns.
 * The turn is the call farthest from the start; the far side is the named area (OSM town, suburb or
 * village) nearest to most calls in the outer half of the loop. Calls before the turn get that label.
 */
export function loopDestination(calls:TripCall[],places:Place[]):LoopDestination|undefined{
 if(calls.length<3)return;const ordered=[...calls].sort((a,b)=>a.sequence-b.sequence),origin=ordered[0].position;
 if(distance(origin,ordered.at(-1)!.position)>LOOP_CLOSE_METRES)return;
 const areas=places.filter(p=>AREA_KINDS.has(p.kind));if(!areas.length)return;
 const nearest=(p:LngLat)=>{let best=areas[0],bestDistance=Infinity;for(const area of areas){const d=distance(area.position,p);if(d<bestDistance){best=area;bestDistance=d;}}return best.name;};
 const reach=ordered.map(c=>distance(origin,c.position)),furthest=Math.max(...reach);if(furthest<LOOP_MIN_REACH_METRES)return;
 const votes=new Map<string,number>();ordered.forEach((c,i)=>{if(reach[i]>=furthest/2){const name=nearest(c.position);votes.set(name,(votes.get(name)??0)+1);}});
 const label=[...votes].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];
 // A loop that never leaves its home area has no distinct far side to announce.
 if(label===nearest(origin))return;
 return {label,beforeSequence:ordered[reach.indexOf(furthest)].sequence};
}
