import {distance} from './geo';
import type {FuelStation,LngLat} from './types';
/** Fuel sums for the map. Every figure keeps the submission time of each price it uses. Forecourts must
 * report a price when it changes, not when it stays the same, so a price filed a fortnight ago is usually
 * still the price on the board. What tells a stale price is a forecourt that has stopped filing: a price is
 * kept out of comparisons when its site has filed nothing for SITE_ACTIVE_MS, when the price itself is older
 * than GRADE_MAX_AGE_MS, or when the source marks the site quiet, because an old price can look like a bargain. Members-only forecourts (Costco) are compared like any other but carry
 * a flag, so every place that shows their price can say that a membership is needed. */
export const GRADE_NAMES:Record<string,string>={E10:'Petrol E10',E5:'Super unleaded E5',B7S:'Diesel',B7P:'Premium diesel'};
/** A forecourt that has filed any price within this window is still reporting, so its unchanged prices count. */
export const SITE_ACTIVE_MS=7*86_400_000;
/** No price counts once it is this old, however busy its forecourt. */
export const GRADE_MAX_AGE_MS=30*86_400_000;
/** When the forecourt last filed a price for any grade, in milliseconds, or NaN when it has none. */
export function lastFiled(s:Pick<FuelStation,'prices'>):number {
 const times=Object.values(s.prices).map(p=>Date.parse(p.submittedAt)).filter(Number.isFinite);
 return times.length?Math.max(...times):NaN;
}
/** Whether a station's price for one grade counts in comparisons, and if not, why: 'site' means the forecourt has filed
 * nothing for over SITE_ACTIVE_MS (days counts from its last filing), 'age' that this price passed GRADE_MAX_AGE_MS. */
export type PriceStatus={state:'current'}|{state:'old';reason:'none'|'quiet'|'site'|'age';days:number};
export function priceStatus(s:Pick<FuelStation,'quiet'|'prices'>,grade:string,now=Date.now()):PriceStatus {
 const p=s.prices[grade];if(!p)return {state:'old',reason:'none',days:0};
 const age=now-Date.parse(p.submittedAt),days=(ms:number)=>Math.floor(ms/86_400_000);
 if(!Number.isFinite(age))return {state:'old',reason:'none',days:0};
 if(s.quiet)return {state:'old',reason:'quiet',days:days(age)};
 const silent=now-lastFiled(s);
 if(silent>SITE_ACTIVE_MS)return {state:'old',reason:'site',days:days(silent)};
 if(age>GRADE_MAX_AGE_MS)return {state:'old',reason:'age',days:days(age)};
 return {state:'current'};
}
/** Short wording for a map label: "9 days old" or "quiet site". */
export const oldShort=(status:Extract<PriceStatus,{state:'old'}>)=>status.reason==='age'||status.reason==='site'?`${status.days} days old`:status.reason==='quiet'?'quiet site':'no price';
/** Full wording for the station card, finishing "This price is …". */
export const oldLong=(status:Extract<PriceStatus,{state:'old'}>,grade:string)=>
 status.reason==='site'?`${status.days} days old: this forecourt has reported no prices for more than seven days`:
 status.reason==='age'?`${status.days} days old: it was last reported more than 30 days ago`:status.reason==='quiet'?'from a site that has stopped reporting (no prices for at least 14 days)':`missing: this site has no ${GRADE_NAMES[grade]??grade} price`;
/** Costco sells fuel to its members only; you need a membership card at the pump. */
export const membersOnly=(s:{brand:string;name:string})=>/costco/i.test(`${s.brand} ${s.name}`);
/** Motorway service areas price well above town forecourts; they are labelled so they read as outliers. */
export const motorway=(s:{name:string})=>/\bservices\b|\bM4\b/i.test(s.name);
/** Roads are longer than a straight line; 1.3 is a common planning factor for town driving. */
export const ROAD_FACTOR=1.3;
export const LITRES_PER_UK_GALLON=4.54609;
export const litresPer100km=(mpg:number)=>100*LITRES_PER_UK_GALLON/(mpg*1.609344);
export interface PriceRow {id:string;name:string;brand:string;postcode:string;position:LngLat;pence:number;submittedAt:string;ageHours:number;motorway:boolean;membersOnly:boolean}
export interface Spread {
 grade:string;current:PriceRow[];old:PriceRow[];
 cheapest?:PriceRow;dearest?:PriceRow;median?:number;
 /** The cheapest current forecourt that needs no membership; the same row as `cheapest` unless that is Costco. */
 cheapestOpen?:PriceRow;
 /** Pounds saved on `litres` at the cheapest forecourt rather than the dearest, and rather than the median. */
 savingDearest:number;savingMedian:number;
 /** The same saving against the median, at `cheapestOpen`. */
 savingMedianOpen:number;litres:number;
}
const pounds=(pence:number,litres:number)=>Math.round(pence*litres)/100;
export function priceRows(stations:FuelStation[],grade:string,now=Date.now()):{current:PriceRow[];old:PriceRow[]} {
 const current:PriceRow[]=[],old:PriceRow[]=[];
 for(const s of stations){const p=s.prices[grade];if(!p)continue;const age=now-Date.parse(p.submittedAt);if(!Number.isFinite(age))continue;
  const row={id:s.id,name:s.name,brand:s.brand,postcode:s.postcode,position:s.position,pence:p.pence,submittedAt:p.submittedAt,ageHours:Math.max(0,Math.round(age/3_600_000)),motorway:motorway(s),membersOnly:membersOnly(s)};
  (priceStatus(s,grade,now).state==='old'?old:current).push(row);}
 const order=(a:PriceRow,b:PriceRow)=>a.pence-b.pence||a.name.localeCompare(b.name);
 return {current:current.sort(order),old:old.sort(order)};
}
export function spread(stations:FuelStation[],grade:string,litres:number,now=Date.now()):Spread {
 const {current,old}=priceRows(stations,grade,now);
 if(!current.length)return {grade,current,old,savingDearest:0,savingMedian:0,savingMedianOpen:0,litres};
 const values=current.map(r=>r.pence),m=values.length>>1,median=values.length%2?values[m]:(values[m-1]+values[m])/2;
 const cheapest=current[0],dearest=current.at(-1)!,cheapestOpen=current.find(r=>!r.membersOnly);
 return {grade,current,old,cheapest,dearest,cheapestOpen,median:Math.round(median*10)/10,litres,savingDearest:pounds(dearest.pence-cheapest.pence,litres),savingMedian:pounds(median-cheapest.pence,litres),
  savingMedianOpen:cheapestOpen?Math.max(0,pounds(median-cheapestOpen.pence,litres)):0};
}
/** Road distance estimate in kilometres between two points. */
export const roadKm=(a:LngLat,b:LngLat)=>distance(a,b)*ROAD_FACTOR/1000;
export interface DetourOption {row:PriceRow;km:number;extraKm:number;fillCost:number;detourCost:number;netSaving:number}
/** Compares every current forecourt with the one nearest `from`: the saving on the fill, less the fuel
 * burned on the extra distance there and back. Sorted best first. */
export function detours(rows:PriceRow[],from:LngLat,litres:number,mpg:number):{nearest?:DetourOption;options:DetourOption[]} {
 if(!rows.length)return {options:[]};
 const burn=litresPer100km(mpg)/100,withKm=rows.map(row=>({row,km:roadKm(from,row.position)}));
 const nearest=withKm.reduce((a,b)=>b.km<a.km?b:a);
 const options=withKm.map(({row,km})=>{const extraKm=Math.max(0,2*(km-nearest.km)),detourCost=pounds(row.pence,extraKm*burn);
  const fillCost=pounds(row.pence,litres);
  return {row,km:Math.round(km*10)/10,extraKm:Math.round(extraKm*10)/10,fillCost,detourCost,netSaving:Math.round((pounds(nearest.row.pence,litres)-fillCost-detourCost)*100)/100};})
  .sort((a,b)=>b.netSaving-a.netSaving||a.km-b.km);
 return {nearest:options.find(o=>o.row.id===nearest.row.id),options};
}
export interface TripInput {from:LngLat;to:LngLat;mpg:number;pence:number;parking:number;busReturn:number}
/** A return trip by car (fuel at `pence`, plus parking) against the bus fare. Fuel only: no wear, insurance or tax. */
export function tripCost(t:TripInput) {
 const km=roadKm(t.from,t.to)*2,fuel=pounds(t.pence,km*litresPer100km(t.mpg)/100);
 return {km:Math.round(km*10)/10,fuel,car:Math.round((fuel+t.parking)*100)/100,bus:t.busReturn};
}
/** How a price compares with the town median, for the pump colour. Two pence either way is the usual spread in town. */
export function band(pence:number,median:number|undefined):'cheap'|'typical'|'dear' {
 if(median===undefined)return 'typical';return pence<=median-2?'cheap':pence>=median+3?'dear':'typical';
}
