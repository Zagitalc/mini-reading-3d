import{z}from'zod';import type{TrafficSegment}from'../../shared/types';import{geometryIntersects}from'../../shared/geo';
const position=z.tuple([z.number().min(-180).max(180),z.number().min(-85).max(85)]);
const schema=z.array(z.object({id:z.string(),coordinates:z.array(position).min(2),currentSpeed:z.number().min(0),freeFlowSpeed:z.number().positive(),confidence:z.number().min(0).max(1),source:z.string().min(1),sourceUrl:z.url().optional(),observedAt:z.iso.datetime({offset:true})}));
// Optional licensed provider bridge: data is deliberately not fabricated from road speed limits.
export function parseTraffic(input:unknown):TrafficSegment[]{return schema.parse(input).filter(s=>geometryIntersects(s.coordinates)&&Date.now()-Date.parse(s.observedAt)<300000&&Date.parse(s.observedAt)<=Date.now()+60000);}
export async function fetchTraffic(url:string,token?:string){const r=await fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{},redirect:'manual',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(`Traffic provider returned HTTP ${r.status}`);return parseTraffic(await r.json());}
