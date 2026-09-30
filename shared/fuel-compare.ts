import {distance} from './geo';
import type {FuelStation,LngLat} from './types';
/** Fuel sums for the map. Every figure keeps the submission time of each price it uses. A price older
 * than PRICE_MAX_AGE_MS, or from a site that has gone quiet, is kept out of comparisons because an old
 * price can look like a bargain. Members-only forecourts (Costco) are compared like any other but carry
 * a flag, so every place that shows their price can say that a membership is needed. */
export const GRADE_NAMES:Record<string,string>={E10:'Petrol E10',E5:'Super unleaded E5',B7S:'Diesel',B7P:'Premium diesel'};
export const PRICE_MAX_AGE_MS=7*86_400_000;
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
  (age>PRICE_MAX_AGE_MS||s.quiet?old:current).push(row);}
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
