import {distance,nearestOnLine} from './geo';
import type {ModeId} from './modes';
import type {LngLat} from './types';
// "Around here": what the layers already hold that is close to the middle of the map (or to a pinned spot). Nothing in
// this file fetches anything; each layer answers for its own data and this file holds the shared rules: how big
// "close" is, how results are ordered and how far a point is from an area.
export const HERE_GROUPS=['roadworks','flood','river','stops','station'] as const;
export type HereGroup=typeof HERE_GROUPS[number];
export const HERE_TITLES:Record<HereGroup,string>={roadworks:'Roadworks and closures',flood:'Flood warnings',river:'River gauges',stops:'Bus stops',station:'Railway station'};
/** Items shown per group, so one busy group cannot push the others off a phone screen. */
export const HERE_LIMIT:Record<HereGroup,number>={roadworks:4,flood:3,river:2,stops:4,station:1};
/** The current mode's own groups come first; the rest keep a common order. */
const LEADS:Record<ModeId,HereGroup[]>={explore:[],transport:['stops','station','roadworks'],drive:['roadworks'],environment:['flood','river'],eat:[],lab:[]};
export const hereOrder=(mode:ModeId):HereGroup[]=>[...LEADS[mode],...HERE_GROUPS.filter(g=>!LEADS[mode].includes(g))];
/** How far "here" reaches, in metres: 800 at zoom 15, doubling for each level zoomed out, between 400 m and 3 km. */
export const hereRadius=(zoom:number)=>Math.round(Math.min(3000,Math.max(400,800*2**(15-zoom)))/50)*50;
/** Gauges and warning areas are sparse and large, so they are looked for at least this far out. */
export const SPARSE_RADIUS=3000;
/** Non-breaking space, so a figure and its unit are never split across two lines in a narrow panel. */
export const formatMetres=(m:number)=>m<950?`${Math.max(10,Math.round(m/10)*10)}\u00a0m`:`${(m/1000).toFixed(1)}\u00a0km`;
export interface Near<T> {item:T;metres:number}
/** The items within `radius` metres of `centre`, nearest first, at most `limit`. */
export function nearest<T>(items:readonly T[],at:(item:T)=>LngLat,centre:LngLat,radius:number,limit:number):Near<T>[] {
 const out:Near<T>[]=[];
 for(const item of items){const metres=distance(centre,at(item));if(metres<=radius)out.push({item,metres});}
 return out.sort((a,b)=>a.metres-b.metres).slice(0,limit);
}
const inRing=(p:LngLat,ring:LngLat[])=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>p[1])!==(yj>p[1])&&p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi)inside=!inside;}return inside;};
/** The nearest point of the area to `p` and how far away it is: 0 metres, and `p` itself, when `p` is inside the area
 * (outer ring, not in a hole). An area with no rings gives Infinity. */
export function nearestInArea(p:LngLat,area:{type:'MultiPolygon';coordinates:LngLat[][][]}):{metres:number;position:LngLat} {
 let best={metres:Infinity,position:p};
 for(const polygon of area.coordinates){
  const [outer,...holes]=polygon;if(!outer)continue;
  if(inRing(p,outer)&&!holes.some(h=>inRing(p,h)))return {metres:0,position:p};
  for(const ring of polygon){const n=nearestOnLine(p,ring);if(n.distance<best.metres)best={metres:n.distance,position:n.position};}
 }
 return best;
}
