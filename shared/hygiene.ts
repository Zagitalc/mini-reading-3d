import {inBounds} from './geo';
import type {Bounds,LngLat} from './types';
/** Food hygiene ratings from the Food Standards Agency's open data, one file per council, bundled at
 * build time (the files send no CORS header and Reading's alone is about 1 MB). */
export const HYGIENE_AUTHORITIES=[
 {code:'884',name:'Reading'},{code:'887',name:'Wokingham'},{code:'883',name:'West Berkshire'},{code:'270',name:'South Oxfordshire'},
] as const;
export const hygieneFileUrl=(code:string)=>`https://ratings.food.gov.uk/api/open-data-files/FHRS${code}en-GB.json`;
/** [FHRS id, name, type index, address, postcode, lon, lat, rating, rating date, new rating pending (1/0)] */
export type HygienePlace=[number,string,number,string,string,number,number,string,string,0|1];
export interface HygieneAuthority {code:string;name:string;extractDate:string;total:number;mapped:number;inArea:number}
export interface HygieneBundle {
 schema:1;source:string;sourceUrl:string;licence:string;generatedAt:string;
 authorities:HygieneAuthority[];types:string[];places:HygienePlace[];
}
export const RATING_TEXT:Record<string,string>={
 '5':'Very good','4':'Good','3':'Generally satisfactory','2':'Improvement necessary','1':'Major improvement necessary','0':'Urgent improvement necessary',
 Exempt:'Exempt: low risk to food safety, so not rated',AwaitingInspection:'Awaiting inspection',AwaitingPublication:'Awaiting publication of the rating',
};
type Raw=Record<string,unknown>;
const text=(v:unknown)=>typeof v==='string'?v.trim():typeof v==='number'?String(v):'';
/** Parses one council file. Records without a location (about three in ten) are counted but not mapped. */
export function parseAuthority(input:unknown,authority:{code:string;name:string},bounds:Bounds,types:string[]):{info:HygieneAuthority;places:HygienePlace[]} {
 const root=(input as {FHRSEstablishment?:{Header?:Raw;EstablishmentCollection?:unknown}})?.FHRSEstablishment;
 if(!root)throw Error(`${authority.name}: not an FHRS open-data file`);
 const collection=root.EstablishmentCollection,list:Raw[]=Array.isArray(collection)?collection:Array.isArray((collection as {EstablishmentDetail?:unknown})?.EstablishmentDetail)?(collection as {EstablishmentDetail:Raw[]}).EstablishmentDetail:[];
 if(!list.length)throw Error(`${authority.name}: no establishments in the file`);
 let mapped=0;const places:HygienePlace[]=[];
 for(const r of list){
  const g=r.Geocode as {Longitude?:unknown;Latitude?:unknown}|null|undefined,lon=Number(g?.Longitude),lat=Number(g?.Latitude);
  if(!g||!Number.isFinite(lon)||!Number.isFinite(lat)||(lon===0&&lat===0))continue;mapped++;
  const position:LngLat=[Math.round(lon*1e5)/1e5,Math.round(lat*1e5)/1e5];if(!inBounds(position,bounds))continue;
  const id=Number(r.FHRSID),name=text(r.BusinessName);if(!Number.isInteger(id)||!name)continue;
  const type=text(r.BusinessType)||'Other';let t=types.indexOf(type);if(t<0)t=types.push(type)-1;
  const address=['AddressLine1','AddressLine2','AddressLine3','AddressLine4'].map(k=>text(r[k])).filter(Boolean).join(', ');
  places.push([id,name,t,address,text(r.PostCode),position[0],position[1],text(r.RatingValue)||'Unknown',text(r.RatingDate).slice(0,10),r.NewRatingPending===true||r.NewRatingPending==='True'?1:0]);
 }
 const header=root.Header??{};
 return {info:{code:authority.code,name:authority.name,extractDate:text(header.ExtractDate).slice(0,10),total:list.length,mapped,inArea:places.length},places};
}
export function hygieneBundle(files:{authority:{code:string;name:string};json:unknown}[],bounds:Bounds,now=new Date()):HygieneBundle {
 const types:string[]=[],authorities:HygieneAuthority[]=[],seen=new Set<number>(),places:HygienePlace[]=[];
 for(const f of files){const {info,places:list}=parseAuthority(f.json,f.authority,bounds,types);authorities.push(info);for(const p of list)if(!seen.has(p[0])){seen.add(p[0]);places.push(p);}}
 return {schema:1,source:'Food Standards Agency food hygiene rating scheme',sourceUrl:'https://ratings.food.gov.uk/open-data',licence:'Open Government Licence v3.0',generatedAt:now.toISOString(),authorities,types,places:places.sort((a,b)=>a[0]-b[0])};
}
/** Colour group for the map: good (4 to 5), fair (3), poor (0 to 2), or none for exempt and awaiting. */
export const ratingGroup=(rating:string)=>/^[45]$/.test(rating)?'good':rating==='3'?'fair':/^[012]$/.test(rating)?'poor':'none';
