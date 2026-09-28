import {z} from 'zod';
import {inBounds} from '../../shared/geo';
import type {FloodWarning,LngLat,RiverFeedItem,RiverGauge} from '../../shared/types';
// Environment Agency Real Time flood-monitoring API: keyless, Open Government Licence.
export const EA_BASE='https://environment.data.gov.uk/flood-monitoring';
export const RIVERS=/\b(thames|kennet)\b/i;
const SEARCH='lat=51.445&long=-0.96&dist=14';
const MAX_GAUGES=16,MAX_NEW_POLYGONS=6,MAX_AREA_BYTES=120_000,AREA_BUDGET=600_000;
const SOURCE='Environment Agency flood-monitoring API';
// Some stations publish two coordinates (for example both sides of a lock); take the first.
const coordinate=z.union([z.number(),z.array(z.number()).nonempty().transform(v=>v[0])]);
const dated=z.object({dateTime:z.string(),value:z.number()}).partial().passthrough();
const reading=z.object({dateTime:z.string(),value:z.union([z.number(),z.array(z.number()).nonempty().transform(v=>v[0])])}).passthrough();
const measure=z.object({'@id':z.string(),parameter:z.string().optional(),qualifier:z.string().optional(),unitName:z.string().optional(),latestReading:z.union([reading,z.string()]).optional()}).passthrough();
const stageScale=z.object({typicalRangeHigh:z.number().optional(),typicalRangeLow:z.number().optional(),highestRecent:dated.optional(),maxOnRecord:dated.optional()}).passthrough();
const station=z.object({stationReference:z.string(),RLOIid:z.union([z.string(),z.array(z.string())]).optional(),label:z.union([z.string(),z.array(z.string()).nonempty().transform(v=>v[0])]),riverName:z.string().optional(),town:z.string().optional(),lat:coordinate,long:coordinate,status:z.union([z.string(),z.array(z.string())]).optional(),
 measures:z.union([measure,z.array(measure)]).optional().transform(m=>m===undefined?[]:Array.isArray(m)?m:[m]),stageScale:z.union([z.string(),stageScale]).optional()}).passthrough();
const list=z.object({items:z.array(z.unknown())});
const round=(n:number,dp=3)=>Math.round(n*10**dp)/10**dp;
const closed=(status:unknown)=>JSON.stringify(status??'').toLowerCase().includes('closed');
// A few stations omit riverName (for example 2290TH "RIVER KENNET AT THEALE"); fall back to the label.
function riverOf(s:{riverName?:string;label:string}) {
 if(s.riverName)return RIVERS.test(s.riverName)?s.riverName:undefined;
 const m=RIVERS.exec(s.label);return m?`River ${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}`:undefined;
}
const tidy=(label:string)=>label===label.toUpperCase()?label.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase()).replace(/\b(At|And|On|Of)\b/g,w=>w.toLowerCase()):label;
// Levels only: '---' measures carry no unit, and some stations publish the same stage in several datums.
const QUALIFIERS=['Stage','Downstream Stage'],UNIT_ORDER=['mASD','mAOD','m'];
/** EA flood times carry no zone; the service publishes UTC (readings carry an explicit Z), so read them as UTC. */
export function eaTime(value:string|undefined):number {if(!value)return NaN;return Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(value)?value:`${value}Z`);}

/** Stations near Reading on the Thames or Kennet that publish a water level. */
export function selectGauges(input:unknown):string[] {
 return list.parse(input).items.flatMap(raw=>{const p=station.safeParse(raw);if(!p.success)return [];const s=p.data;
  if(!riverOf(s)||closed(s.status)||!inBounds([s.long,s.lat]))return [];
  return s.measures.some(m=>m.parameter==='level')?[s.stationReference]:[];
 }).slice(0,MAX_GAUGES);
}

/** One station document (/id/stations/{ref}) with its latest level readings. */
export function parseGauge(input:unknown,now=Date.now()):RiverGauge|undefined {
 const s=station.parse(z.object({items:z.unknown()}).parse(input).items);
 const position:LngLat=[s.long,s.lat],river=riverOf(s);if(!inBounds(position)||!river)return;
 const usable=s.measures.filter(m=>m.parameter==='level'&&QUALIFIERS.includes(m.qualifier??'')&&UNIT_ORDER.includes(m.unitName??''));
 // One reading per qualifier, preferring the local stage datum the typical range is published in.
 const chosen=QUALIFIERS.flatMap(q=>usable.filter(m=>m.qualifier===q&&typeof m.latestReading==='object').sort((a,b)=>UNIT_ORDER.indexOf(a.unitName!)-UNIT_ORDER.indexOf(b.unitName!)).slice(0,1));
 const levels=chosen.flatMap(m=>{
  const r=typeof m.latestReading==='object'?m.latestReading:undefined;
  const time=r?eaTime(r.dateTime):NaN;
  // A reading dated in the future is a publisher error, not a measurement.
  if(!r||!Number.isFinite(time)||time>now+60_000)return [];
  return [{id:m['@id'].split('/').pop()!,qualifier:m.qualifier!,unit:m.unitName!,value:round(r.value),readAt:new Date(time).toISOString()}];
 });
 if(!levels.length)return;
 const scale=typeof s.stageScale==='object'?s.stageScale:undefined;
 const high=scale?.highestRecent?.value!==undefined&&scale.highestRecent.dateTime?{value:round(scale.highestRecent.value),at:new Date(eaTime(scale.highestRecent.dateTime)).toISOString()}:undefined;
 const observedAt=levels.map(l=>l.readAt).sort().at(-1)!,rloi=[s.RLOIid].flat()[0];
 return {id:`ea:${s.stationReference}`,kind:'gauge',reference:s.stationReference,label:tidy(s.label),river,town:s.town,position,levels,
  typicalLow:scale?.typicalRangeLow,typicalHigh:scale?.typicalRangeHigh,highestRecent:high,observedAt,source:SOURCE,
  // Check for flooding addresses gauges by their RLOI id; without one, link the API record.
  sourceUrl:rloi?`https://check-for-flooding.service.gov.uk/station/${encodeURIComponent(rloi)}`:`${EA_BASE}/id/stations/${encodeURIComponent(s.stationReference)}`};
}

const flood=z.object({floodAreaID:z.string(),description:z.string().optional(),eaAreaName:z.string().optional(),severity:z.string().optional(),severityLevel:z.number().int().min(1).max(4),message:z.string().optional(),
 timeRaised:z.string().optional(),timeMessageChanged:z.string().optional(),timeSeverityChanged:z.string().optional(),
 floodArea:z.object({polygon:z.string().optional(),riverOrSea:z.string().optional(),county:z.string().optional()}).passthrough().optional()}).passthrough();
const iso=(t?:string)=>{const v=eaTime(t);return Number.isFinite(v)?new Date(v).toISOString():undefined;};
const LABEL={1:'Severe flood warning',2:'Flood warning',3:'Flood alert',4:'Warning no longer in force'} as const;

/** Current flood alerts and warnings near Reading; level 4 (no longer in force) is dropped. */
export function parseFloods(input:unknown,now=Date.now()):Omit<FloodWarning,'area'>[] {
 return list.parse(input).items.flatMap(raw=>{const p=flood.safeParse(raw);if(!p.success)return [];const f=p.data;
  if(f.severityLevel===4)return [];
  const changed=[f.timeMessageChanged,f.timeSeverityChanged,f.timeRaised].map(eaTime).filter(t=>Number.isFinite(t)&&t<=now+60_000);
  const observedAt=new Date(changed.length?Math.max(...changed):now).toISOString();
  return [{id:`flood:${f.floodAreaID}`,kind:'warning',areaId:f.floodAreaID,label:f.description??f.floodAreaID,severityLevel:f.severityLevel as 1|2|3,severity:LABEL[f.severityLevel as 1|2|3],
   message:f.message?.split('\n').map(l=>l.trim()).join('\n').trim()||undefined,raisedAt:iso(f.timeRaised),changedAt:iso(f.timeMessageChanged),river:f.floodArea?.riverOrSea,polygonUrl:f.floodArea?.polygon?.replace(/^http:/,'https:'),observedAt,source:SOURCE,
   sourceUrl:`https://check-for-flooding.service.gov.uk/target-area/${encodeURIComponent(f.floodAreaID)}`}];
 });
}

// Perpendicular-distance simplification in degrees; 0.00005° is about 4–5 m at Reading's latitude.
function simplify(ring:LngLat[],tolerance=0.00005):LngLat[] {
 if(ring.length<=4)return ring;
 const keep=new Uint8Array(ring.length);keep[0]=keep[ring.length-1]=1;const stack:[number,number][]=[[0,ring.length-1]];
 while(stack.length){const [a,b]=stack.pop()!;let index=-1,max=0;const [x1,y1]=ring[a],[x2,y2]=ring[b],dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
  for(let i=a+1;i<b;i++){const [x,y]=ring[i];const d=len?Math.abs(dy*x-dx*y+x2*y1-y2*x1)/len:Math.hypot(x-x1,y-y1);if(d>max){max=d;index=i;}}
  if(max>tolerance&&index>0){keep[index]=1;stack.push([a,index],[index,b]);}}
 const out=ring.filter((_,i)=>keep[i]);return out.length>=4?out:ring;
}
const ringSchema=z.array(z.array(z.number()).min(2));
/**
 * Local outlines range from 14 KB to over 500 KB (061WAF22LowerKen). Simplify more coarsely (about 5, 20, then 80 m)
 * until the outline fits, so a few large warnings cannot push the snapshot past D1's row budget.
 */
export function fitPolygon(input:unknown,maxBytes=MAX_AREA_BYTES):{area:FloodWarning['area'];tooLarge:boolean} {
 for(const tolerance of [0.00005,0.0002,0.0008]){const area=parsePolygon(input,tolerance);if(!area)return {area,tooLarge:false};if(JSON.stringify(area).length<=maxBytes)return {area,tooLarge:false};}
 return {area:null,tooLarge:true};
}
/** Official flood-area outline, reduced to a MultiPolygon with ~1 m precision to stay within storage budgets. */
export function parsePolygon(input:unknown,tolerance=0.00005):FloodWarning['area'] {
 const g=z.object({type:z.string(),features:z.array(z.object({geometry:z.object({type:z.string(),coordinates:z.unknown()})})).optional(),geometry:z.object({type:z.string(),coordinates:z.unknown()}).optional(),coordinates:z.unknown().optional()}).parse(input);
 const geometries=g.type==='FeatureCollection'?g.features!.map(f=>f.geometry):g.type==='Feature'?[g.geometry!]:[{type:g.type,coordinates:g.coordinates}];
 const polygons:LngLat[][][]=[];
 for(const geometry of geometries){
  const rings=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates as unknown[]:[];
  for(const poly of rings as unknown[]){const parsed=z.array(ringSchema).safeParse(poly);if(!parsed.success)continue;
   const cleaned=parsed.data.map(r=>simplify(r.map(p=>[Math.round(p[0]*1e5)/1e5,Math.round(p[1]*1e5)/1e5] as LngLat),tolerance)).filter(r=>r.length>=4);if(cleaned.length)polygons.push(cleaned);}
 }
 return polygons.length?{type:'MultiPolygon',coordinates:polygons}:null;
}

async function getJson(url:string) {
 const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'MiniReading3D/1 (+https://github.com/Zagitalc/mini-reading-3d)'},signal:AbortSignal.timeout(15_000)});
 if(!r.ok)throw Error(`River provider returned HTTP ${r.status}`);return r.json();
}
/**
 * One shared refresh: station list, one document per gauge, current floods, and outlines only for
 * warnings not already held. `previous` is the last saved snapshot, so polygons are fetched once per warning.
 */
export async function fetchRivers(previous:RiverFeedItem[]=[]):Promise<RiverFeedItem[]> {
 const refs=selectGauges(await getJson(`${EA_BASE}/id/stations?parameter=level&${SEARCH}`));
 const gauges:RiverGauge[]=[];
 for(const ref of refs){try{const g=parseGauge(await getJson(`${EA_BASE}/id/stations/${encodeURIComponent(ref)}`));if(g)gauges.push(g);}catch{/* one silent gauge must not hide the rest */}}
 if(refs.length&&!gauges.length)throw Error('River provider returned no usable readings');
 const known=new Map(previous.filter((i):i is FloodWarning=>i.kind==='warning'&&(!!i.area||!!i.areaTooLarge)).map(w=>[w.areaId,w]));
 let fetched=0,bytes=0;const warnings:FloodWarning[]=[];
 // Most severe first, so they are the ones drawn if the outline budget runs out.
 for(const w of parseFloods(await getJson(`${EA_BASE}/id/floods?${SEARCH}`)).sort((a,b)=>a.severityLevel-b.severityLevel)){
  const prior=known.get(w.areaId);let area=prior?.area??null,areaTooLarge=prior?.areaTooLarge;
  if(!prior&&w.polygonUrl?.startsWith(EA_BASE)&&fetched<MAX_NEW_POLYGONS){fetched++;try{const fit=fitPolygon(await getJson(w.polygonUrl));area=fit.area;areaTooLarge=fit.tooLarge||undefined;}catch{area=null;}}
  const size=area?JSON.stringify(area).length:0;
  // Over the shared budget: list it undrawn this time; the outline is fetched again next refresh.
  if(area&&bytes+size>AREA_BUDGET)area=null;else bytes+=size;
  warnings.push({...w,area,...(areaTooLarge?{areaTooLarge}:{})});
 }
 return [...gauges,...warnings];
}
