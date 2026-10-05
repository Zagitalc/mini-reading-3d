import {spread} from './fuel-compare';
import type {ModeId} from './modes';
import type {FuelStation} from './types';
// Mode summary cards: a few plain lines about "right now", built only from figures the layers already hold. Nothing
// here fetches anything; a line whose data has not arrived says so, and a figure that has stopped updating says how old it is.
export interface VehicleFact {buses:number;busRoutes:number;trains:number;at:number}
export interface RoadworksFact {active:number;closures:number;at:number}
export interface FuelFact {count:number;grade:string;cheapest?:{name:string;pence:number;membersOnly:boolean};cheapestOpen?:{name:string;pence:number};median?:number;at:number}
export interface WeatherFact {temperature:number;cloudCover:number;precipitation:'none'|'rain'|'snow';at:number}
export interface RiversFact {gauges:number;high:string[];low:string[];normal:number;unknown:number;warnings:{severe:number;warning:number;alert:number};warningsKnown:boolean;at:number}
export interface FoodFact {total:number;restaurant:number;takeaway:number;pub:number;rated5:number;authorityDate:string}
export interface ExploreFact {buildings:number;landmarks:number;nearest?:{name:string;metres:number}}
export interface Facts {vehicles?:VehicleFact|null;roadworks?:RoadworksFact;fuel?:FuelFact;weather?:WeatherFact;rivers?:RiversFact;food?:FoodFact;explore?:ExploreFact}
export type SummaryLine={label:string;text:string;note?:string;stale?:boolean};
export type Summary={title:string;lines:SummaryLine[];action?:{label:string;search:boolean}};
/** How long a reading may go unrefreshed before the card says it may be out of date. */
export const MAX_AGE={vehicles:5*60_000,roadworks:30*60_000,weather:2*3_600_000,rivers:2*3_600_000,fuel:36*3_600_000} as const;
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});
const plural=(n:number,one:string,many=one+'s')=>`${n.toLocaleString('en-GB')} ${n===1?one:many}`;
const pence=(v:number)=>`${v.toFixed(1)}p`;
const age=(at:number,max:number,now:number)=>({note:`${now-at>max?'last reading':'updated'} ${clock.format(at)}`,stale:now-at>max});
/** Fuel digest for the card: the cheapest current E10 price, the cheapest that needs no membership, and the middle price. */
export function fuelFact(stations:FuelStation[],at:number,grade='E10'):FuelFact|undefined {
 if(!stations.length)return undefined;
 const s=spread(stations,grade,40,at),open=s.cheapestOpen;
 return {count:s.current.length,grade,at:Date.parse(stations.map(x=>x.observedAt).sort().at(-1)!)||at,
  cheapest:s.cheapest&&{name:s.cheapest.name,pence:s.cheapest.pence,membersOnly:s.cheapest.membersOnly},
  cheapestOpen:s.cheapest?.membersOnly&&open?{name:open.name,pence:open.pence}:undefined,median:s.median};
}
const L={
 vehicles(f:Facts,now:number,short=false):SummaryLine[] {
  const v=f.vehicles;
  if(v===undefined)return [{label:'Buses and trains',text:'Waiting for the first positions…'}];
  if(v===null)return [{label:'Buses and trains',text:'Live positions are unavailable right now.'}];
  const a=age(v.at,MAX_AGE.vehicles,now);
  const buses=v.buses?`${plural(v.buses,'bus','buses')} on ${plural(v.busRoutes,'route')}`:'No buses reporting';
  return [{label:'Buses',text:buses,...a},...(short?[]:[{label:'Trains',text:v.trains?`${plural(v.trains,'train')}, positions estimated`:'None on the map'}])];
 },
 roadworks(f:Facts,now:number):SummaryLine[] {
  const r=f.roadworks;if(!r)return [{label:'Roadworks',text:'Loading…'}];
  const text=r.active?`${plural(r.active,'active roadwork')}${r.closures?`, ${plural(r.closures,'closure')} among them`:''}`:'No active roadworks or closures';
  return [{label:'Roadworks',text,...age(r.at,MAX_AGE.roadworks,now)}];
 },
 fuel(f:Facts,now:number):SummaryLine[] {
  const x=f.fuel;if(!x)return [{label:'Fuel',text:'No prices loaded.'}];
  if(!x.cheapest)return [{label:'Fuel',text:`No forecourt has reported a current ${x.grade} price.`}];
  const a=age(x.at,MAX_AGE.fuel,now),lines:SummaryLine[]=[{label:`Cheapest ${x.grade}`,text:`${x.cheapest.name} ${pence(x.cheapest.pence)}${x.cheapest.membersOnly?' (members only)':''}`,...a}];
  if(x.cheapestOpen)lines.push({label:'Without membership',text:`${x.cheapestOpen.name} ${pence(x.cheapestOpen.pence)}`});
  if(x.median!==undefined)lines.push({label:'Middle price',text:`${pence(x.median)} across ${plural(x.count,'forecourt')}`});
  return lines;
 },
 weather(f:Facts,now:number):SummaryLine[] {
  const w=f.weather;if(!w)return [{label:'Weather',text:'Not available.'}];
  const sky=w.precipitation==='snow'?'snow':w.precipitation==='rain'?'rain':w.cloudCover>=70?'cloudy':w.cloudCover>=30?'part cloud':'clear';
  return [{label:'Weather',text:`${Math.round(w.temperature)}°C, ${sky} (modelled, not measured here)`,...age(w.at,MAX_AGE.weather,now)}];
 },
 rivers(f:Facts,now:number,short=false):SummaryLine[] {
  const r=f.rivers;if(!r)return [{label:'Rivers',text:'No gauge readings yet.'}];
  const w=r.warnings,total=w.severe+w.warning+w.alert;
  const flood=!r.warningsKnown?'Could not be checked right now':total?[w.severe&&plural(w.severe,'severe flood warning'),w.warning&&plural(w.warning,'flood warning'),w.alert&&plural(w.alert,'flood alert')].filter(Boolean).join(', ')+' in force':'None in force';
  const parts=[r.normal&&`${r.normal} within typical range`,r.high.length&&`${r.high.length} above`,r.low.length&&`${r.low.length} below`,r.unknown&&`${r.unknown} with no typical range`].filter(Boolean).join(', ');
  const lines:SummaryLine[]=[{label:'Flood warnings',text:flood,...age(r.at,MAX_AGE.rivers,now)}];
  if(!short||r.high.length)lines.push({label:`${r.gauges} river gauges`,text:parts||'No readings'});
  if(r.high.length)lines.push({label:'Above typical range',text:r.high.join(', ')});
  if(!short&&r.low.length)lines.push({label:'Below typical range',text:r.low.join(', ')});
  return lines;
 },
 food(f:Facts):SummaryLine[] {
  const x=f.food;if(!x)return [{label:'Food',text:'Loading hygiene ratings…'}];
  return [{label:'Premises',text:`${x.total.toLocaleString('en-GB')} places to eat or drink`,note:`council data from ${x.authorityDate}`},
   {label:'By type',text:`${x.restaurant} restaurants and cafés, ${x.takeaway} takeaways, ${x.pub} pubs and bars`},
   {label:'Hygiene rating 5',text:`${x.rated5.toLocaleString('en-GB')} of ${x.total.toLocaleString('en-GB')} (hygiene only, not food quality)`}];
 },
 explore(f:Facts):SummaryLine[] {
  const x=f.explore;if(!x)return [];
  return [{label:'The miniature',text:`${x.buildings.toLocaleString('en-GB')} building footprints, ${x.landmarks} modelled landmarks`},
   ...(x.nearest?[{label:'Nearest landmark',text:`${x.nearest.name}, ${x.nearest.metres>=1000?`${(x.nearest.metres/1000).toFixed(1)} km`:`${Math.round(x.nearest.metres/10)*10} m`} from the middle of the map`}]:[])];
 },
};
/** The card for a mode. `now` is passed in so tests can fix it. */
export function summarise(mode:ModeId,facts:Facts,now=Date.now()):Summary {
 switch(mode){
  case 'transport':return {title:'Right now',lines:[...L.vehicles(facts,now),...L.roadworks(facts,now)],action:{label:'Search routes and stops',search:true}};
  case 'drive':return {title:'Right now',lines:[...L.roadworks(facts,now),...L.fuel(facts,now),...L.weather(facts,now)],action:{label:'Search fuel forecourts',search:true}};
  case 'environment':return {title:'Right now',lines:[...L.weather(facts,now),...L.rivers(facts,now)],action:{label:'Search river gauges',search:true}};
  case 'eat':return {title:'In the data',lines:L.food(facts),action:{label:'Search food premises',search:true}};
  case 'explore':return {title:'Around you',lines:L.explore(facts),action:{label:'Search landmarks and places',search:true}};
  case 'lab':return {title:'Right now',lines:[...L.vehicles(facts,now,true),...L.roadworks(facts,now),...L.fuel(facts,now).slice(0,1),...L.weather(facts,now),...L.rivers(facts,now,true),...L.food(facts).slice(0,1)]};
 }
}
