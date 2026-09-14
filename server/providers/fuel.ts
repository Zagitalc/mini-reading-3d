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
export async function fetchFuel() {
 const r=await fetch('https://cheapfuelnearme.uk/api/v1/towns/reading.json',{signal:AbortSignal.timeout(12_000)});if(!r.ok)throw Error(`Fuel HTTP ${r.status}`);return parseFuel(await r.json());
}
