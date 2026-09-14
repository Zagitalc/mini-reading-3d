import {BOUNDS} from '../../shared/config';
import {CADENCE} from '../../shared/feed-policy';
export const TRAFFIC_MAX_ZOOM=14;
export const trafficBudget=(value?:string)=>Math.max(0,Math.min(180000,Number(value)||150000));
export const trafficPeriod=()=>new Date().toISOString().slice(0,7);
export function validTrafficTile(z:number,x:number,y:number) {
 if(![z,x,y].every(Number.isInteger)||z<10||z>TRAFFIC_MAX_ZOOM||x<0||y<0||x>=2**z||y>=2**z)return false;
 const lon=(n:number)=>n/2**z*360-180,lat=(n:number)=>Math.atan(Math.sinh(Math.PI*(1-2*n/2**z)))*180/Math.PI;
 return lon(x)<=BOUNDS[2]&&lon(x+1)>=BOUNDS[0]&&lat(y)>=BOUNDS[1]&&lat(y+1)<=BOUNDS[3];
}
type CacheLike={match:(key:string)=>Promise<Response|undefined>;put:(key:string,response:Response)=>Promise<unknown>};
// Coalesce identical in-flight tiles inside an isolate/process; shared cache handles later viewers.
export class TrafficTiles {
 pending=new Map<string,Promise<Response>>();blockedUntil=0;
 constructor(private cache:CacheLike,private reserve:()=>Promise<boolean>){}
 async get(key:string|undefined,z:number,x:number,y:number):Promise<Response>{
  if(!validTrafficTile(z,x,y))return new Response(null,{status:404});
  if(!key)return new Response(null,{status:503});
  const cacheKey=`https://traffic-cache.internal/v2/${z}/${x}/${y}`;
  const cached=await this.cache.match(cacheKey);if(cached)return cached;
  if(Date.now()<this.blockedUntil)return new Response(null,{status:503,headers:{'Retry-After':'300'}});
  let pending=this.pending.get(cacheKey);
  if(!pending){pending=(async()=>{
   if(!await this.reserve()){this.blockedUntil=Date.now()+CADENCE.traffic;return new Response(null,{status:429,headers:{'Retry-After':'300'}});}
   try{
    const r=await fetch(`https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile/${z}/${x}/${y}?apiVersion=2`,{headers:{'TomTom-Api-Key':key},signal:AbortSignal.timeout(10000)});
    if(!r.ok){this.blockedUntil=Date.now()+CADENCE.traffic;return new Response(null,{status:503,headers:{'Retry-After':'300'}});}
    const response=new Response(await r.arrayBuffer(),{headers:{'Content-Type':'application/vnd.mapbox-vector-tile','Cache-Control':'public, max-age=300','X-Traffic-Fetched-At':new Date().toISOString()}});
    await this.cache.put(cacheKey,response.clone());return response;
   }catch{this.blockedUntil=Date.now()+CADENCE.traffic;return new Response(null,{status:503});}
  })();this.pending.set(cacheKey,pending);}
  try{return (await pending).clone();}finally{this.pending.delete(cacheKey);}
 }
}
export function memoryTileCache():CacheLike {
 const entries=new Map<string,{response:Response;until:number}>();
 return {async match(key){const e=entries.get(key);if(e&&e.until>Date.now())return e.response.clone();entries.delete(key);},async put(key,response){for(const [k,e] of entries)if(e.until<Date.now())entries.delete(k);if(entries.size>=256)entries.delete(entries.keys().next().value!);entries.set(key,{response,until:Date.now()+CADENCE.traffic});}};
}
