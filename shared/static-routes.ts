import {BOUNDS} from './config';
import type {Bounds,LngLat} from './types';
export interface StaticRoute {
 id:string;label:string;operator?:string;destinations:string[];colour:string;colourSource:string;
 source:string;sourceUrl:string;snapshot:string;coordinates:LngLat[][];kind:'bus'|'rail';
}
// Liang–Barsky clipping preserves exits/re-entries as separate lines.
export function clipLine(line:LngLat[],b:Bounds=BOUNDS):LngLat[][] {
 const out:LngLat[][]=[];let run:LngLat[]=[];
 for(let i=1;i<line.length;i++){
  const [x,y]=line[i-1],dx=line[i][0]-x,dy=line[i][1]-y;let lo=0,hi=1,hit=true;
  for(const [p,q] of [[-dx,x-b[0]],[dx,b[2]-x],[-dy,y-b[1]],[dy,b[3]-y]]){
   if(!p){if(q<0)hit=false;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}
  }
  if(!hit||lo>hi){if(run.length>1)out.push(run);run=[];continue;}
  const a:LngLat=[x+lo*dx,y+lo*dy],z:LngLat=[x+hi*dx,y+hi*dy];
  if(Math.hypot(a[0]-z[0],a[1]-z[1])<1e-12)continue;
  if(run.length&&Math.hypot(run.at(-1)![0]-a[0],run.at(-1)![1]-a[1])>1e-9){out.push(run);run=[];}
  if(!run.length)run.push(a);run.push(z);
 }
 if(run.length>1)out.push(run);return out;
}
export function lineKey(line:LngLat[]){const a=line.map(p=>p.map(v=>v.toFixed(6)).join(',')).join(';'),b=[...line].reverse().map(p=>p.map(v=>v.toFixed(6)).join(',')).join(';');return a<b?a:b;}
export function deduplicate(lines:LngLat[][]){return [...new Map(lines.map(l=>[lineKey(l),l])).values()];}
const palette=['#396ea6','#9c486e','#167d79','#a46925','#6b58a0','#b04b40','#58763b','#875c47'];
export function fallbackColour(id:string){let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return palette[h%palette.length];}
export function routeMatches(r:StaticRoute,q:string){return [r.label,r.operator,...r.destinations].join(' ').toLowerCase().includes(q.trim().toLowerCase());}
export function uniqueRoutes(ids:string[]){return [...new Set(ids)];}
// The bundled map font contains Latin-1. Keep typographic punctuation in HTML details.
export function mapRouteLabel(label:string){return label.replace(/[–—]/g,'-');}
