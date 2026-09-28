import {z} from 'zod';
import {inBounds} from '../../shared/geo';
import type {FuelStation} from '../../shared/types';
const station=z.object({id:z.string(),name:z.string(),brand:z.string(),postcode:z.string(),lat:z.number(),lon:z.number(),site_quiet:z.boolean(),location_repaired:z.string().nullable().optional(),prices:z.record(z.string(),z.object({pence_per_litre:z.number().positive().max(999),submitted_at:z.string().datetime({offset:true})}))});
export function parseFuel(input:unknown,now=Date.now()):FuelStation[] {
 const data=z.object({source_generated_at:z.string().datetime({offset:true}),stations:z.array(z.unknown())}).parse(input);
 if(now-Date.parse(data.source_generated_at)>48*3_600_000||Date.parse(data.source_generated_at)>now+60_000)throw Error('Fuel source snapshot is stale');
 return data.stations.flatMap(raw=>{const p=station.safeParse(raw);if(!p.success)return [];const s=p.data;
  // District-centre repairs cannot locate an actual forecourt accurately.
  if(!inBounds([s.lon,s.lat])||s.location_repaired==='district_centre')return [];
  const prices=Object.fromEntries(Object.entries(s.prices).filter(([,p])=>Date.parse(p.submitted_at)<=now+60_000).map(([grade,p])=>[grade,{pence:p.pence_per_litre,submittedAt:p.submitted_at}]));
  return [{id:s.id,name:s.name,brand:s.brand,postcode:s.postcode,position:[s.lon,s.lat] as [number,number],quiet:s.site_quiet,locationRepaired:s.location_repaired??undefined,prices,observedAt:data.source_generated_at,source:'Fuel Finder via Cheap Fuel Near Me (twice-daily mirror)',sourceUrl:'https://cheapfuelnearme.uk/api/'}];
 });
}
/** Every UK forecourt; the Reading town file leaves out ones filed under another town (Earley, Winnersh, Tilehurst…). */
export const FUEL_NATIONAL_URL='https://cheapfuelnearme.uk/api/v1/stations.json';
export const FUEL_USER_AGENT='MiniReading3D/0.1 (+https://github.com/Zagitalc/mini-reading-3d)';
/** Keeps only records inside the map, checked on raw coordinates before any schema work, so the
 * 3 MB national file costs one pass. The output has the source's own shape, ready for parseFuel. */
export function trimFuelToArea(input:unknown){
 const data=z.object({source_generated_at:z.string(),stations:z.array(z.unknown())}).parse(input);
 const near=(r:unknown)=>{const s=r as {lat?:unknown;lon?:unknown};return typeof s?.lat==='number'&&typeof s?.lon==='number'&&inBounds([s.lon,s.lat]);};
 return {source_generated_at:data.source_generated_at,stations:data.stations.filter(near)};
}
/** The national file trimmed to the map; used by the GitHub fuel refresh and the local server. */
export async function fetchFuelArea() {
 const r=await fetch(FUEL_NATIONAL_URL,{headers:{'User-Agent':FUEL_USER_AGENT},signal:AbortSignal.timeout(60_000)});if(!r.ok)throw Error(`Fuel HTTP ${r.status}`);return trimFuelToArea(await r.json());
}
/** The Worker's own fallback: the small Reading town file, which misses a few forecourts in the area. */
export async function fetchFuel() {
 const r=await fetch('https://cheapfuelnearme.uk/api/v1/towns/reading.json',{signal:AbortSignal.timeout(12_000)});if(!r.ok)throw Error(`Fuel HTTP ${r.status}`);return parseFuel(await r.json());
}
