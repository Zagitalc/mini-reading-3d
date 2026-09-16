export const STANDARD_LIMITS = ['20', '30', '40', '50', '60', '70', 'NSL'] as const;
export function speedLimit(value: unknown): string | undefined {
 const s = String(value ?? '').trim().toLowerCase();
 if (['national', 'gb:nsl_single', 'gb:nsl_dual', 'gb:nsl_motorway'].includes(s)) return 'NSL';
 const zone=s.match(/^gb:zone(20|30)$/);if(zone)return zone[1];
 return s.match(/^(20|30|40|50|60|70)(?:\s*mph)?$/i)?.[1];
}
/** Keep directional/conditional restrictions as information rather than a false single limit. */
export function roadSpeedLimit(tags:Record<string,unknown>): {limit:string; speedDetails?:Record<string,string>} | undefined {
 const type=speedLimit(tags['maxspeed:type']),explicit=speedLimit(tags.maxspeed);
 const base=type==='NSL'&&(!explicit||['60','70','NSL'].includes(explicit))?type:explicit??type;
 const keys=['maxspeed:forward','maxspeed:backward','maxspeed:conditional','maxspeed:forward:conditional','maxspeed:backward:conditional'];
 const details=Object.fromEntries(['maxspeed','maxspeed:type',...keys].filter(k=>tags[k]!==undefined&&String(tags[k]).trim()).map(k=>[k,String(tags[k]).trim()]));
 const forward=tags['maxspeed:forward']===undefined?base:speedLimit(tags['maxspeed:forward']);
 const backward=tags['maxspeed:backward']===undefined?base:speedLimit(tags['maxspeed:backward']);
 if(type&&tags.maxspeed!==undefined&&(!explicit||(type!==explicit&&!(type==='NSL'&&['60','70'].includes(explicit)))))return {limit:'↔',speedDetails:details};
 if(keys.some(k=>k.includes('conditional')&&details[k])||keys.slice(0,2).some(k=>details[k])&&(!forward||!backward||forward!==backward))return {limit:'↔',speedDetails:details};
 const limit=forward??base;return limit?{limit}:undefined;
}
export function surveyedLimit(tags: Record<string, unknown>) {
 return speedLimit(tags.maxspeed) ?? String(tags.traffic_sign ?? '').match(/(?:274|670)\[(20|30|40|50|60|70)\]/)?.[1]
  ?? (/(?:^|[;,:])(?:GB:)?671(?:$|[;,])/.test(String(tags.traffic_sign ?? '')) ? 'NSL' : undefined);
}
