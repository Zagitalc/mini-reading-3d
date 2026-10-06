import {londonDay,type HistoryResponse,type HourSummary} from './history';
// Plain-language headlines from the recorded history, for the two series that can carry them: Reading station
// punctuality and daily fuel prices. Buses are left out on purpose: they are sampled only while someone has the map
// open, so a bus comparison would mostly measure when people looked.
export interface Headline {id:string;kind:'rail'|'fuel';text:string;note?:string}
export interface Headlines {items:Headline[];/** Why a headline is missing, in the viewer's terms. */missing:string[]}
/** An hour counts as recorded for rail only when the recorder ran for most of it. */
export const MIN_RECORDED_MINUTES=45;
/** Fewest recorded hours that both days share before the two days are compared. */
export const MIN_SHARED_HOURS=6;
/** Fewest departures on each side; fewer than this is noise, not a trend. */
export const MIN_DEPARTURES=20;
/** A fuel move smaller than this is called "unchanged". */
const FUEL_STEADY_PENCE=0.2;
const GRADE_NAMES:Record<string,string>={E10:'Petrol E10',B7S:'Diesel'};
const hourOfDay=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'});
const dayName=(day:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(Date.parse(day+'T12:00:00Z'));
const shiftDay=(day:string,by:number)=>new Date(Date.parse(day+'T12:00:00Z')+by*86_400_000).toISOString().slice(0,10);
const percent=(part:number,whole:number)=>Math.round(part/whole*100);
const plural=(n:number,one:string,many=one+'s')=>`${n} ${n===1?one:many}`;
interface Tally {hours:number;departures:number;bad:number;late:number;cancelled:number}
function tally(hours:HourSummary[]):Tally {
 return hours.reduce((a,h)=>({hours:a.hours+1,departures:a.departures+h.rail.departures,bad:a.bad+h.rail.late+h.rail.cancelled,late:a.late+h.rail.late,cancelled:a.cancelled+h.rail.cancelled}),{hours:0,departures:0,bad:0,late:0,cancelled:0});
}
/** Reading station today so far against the same hours of yesterday, using only hours recorded on both days. */
export function railHeadline(data:HistoryResponse,now:number):{headline?:Headline;missing?:string} {
 const today=londonDay(now),yesterday=shiftDay(today,-1),upTo=+hourOfDay.format(now);
 const byDay=new Map<string,Map<number,HourSummary>>();
 for(const h of data.hours){if(h.minutes<MIN_RECORDED_MINUTES)continue;const t=Date.parse(h.hour),d=londonDay(t),hr=+hourOfDay.format(t);
  if(d!==today&&d!==yesterday)continue;if(d===today&&hr>=upTo)continue;(byDay.get(d)??byDay.set(d,new Map()).get(d)!).set(hr,h);}
 const a=byDay.get(today)??new Map<number,HourSummary>(),b=byDay.get(yesterday)??new Map<number,HourSummary>();
 const shared=[...a.keys()].filter(hr=>b.has(hr)).sort((x,y)=>x-y);
 if(shared.length<MIN_SHARED_HOURS)return {missing:'Station punctuality needs at least six hours recorded on both today and yesterday.'};
 const now1=tally(shared.map(hr=>a.get(hr)!)),then=tally(shared.map(hr=>b.get(hr)!));
 if(now1.departures<MIN_DEPARTURES||then.departures<MIN_DEPARTURES)return {missing:'Too few station departures recorded to compare today with yesterday.'};
 const p1=percent(now1.bad,now1.departures),p0=percent(then.bad,then.departures),first=shared[0],last=shared.at(-1)!+1;
 const clock=(h:number)=>`${String(h%24).padStart(2,'0')}:00`;
 const compare=p1===p0?`the same share (${p0}%) as`:`against ${p0}% at`;
 return {headline:{id:'rail-today',kind:'rail',
  text:`Reading station: ${p1}% of departures late or cancelled so far today (${now1.bad} of ${now1.departures}), ${compare} the same hours yesterday (${then.bad} of ${then.departures}).`,
  note:`Compared over ${plural(shared.length,'hour')} recorded on both days, from ${clock(first)} to ${clock(last)} London time. Late means 5 minutes or more; ${plural(now1.cancelled,'cancellation')} today, ${then.cancelled} yesterday.`}};
}
/** Median pump price against about a week earlier, per grade. */
export function fuelHeadlines(data:HistoryResponse):{headlines:Headline[];missing?:string} {
 const days=[...data.fuel].sort((a,b)=>a.day.localeCompare(b.day)),latest=days.at(-1);
 if(!latest)return {headlines:[],missing:'No fuel prices have been recorded yet.'};
 const week=shiftDay(latest.day,-7),earlier=days.find(d=>d.day===week)??days.find(d=>d.day<=shiftDay(latest.day,-3));
 if(!earlier)return {headlines:[],missing:'Fuel comparisons need prices recorded on at least two days, three or more days apart.'};
 const headlines:Headline[]=[];
 for(const grade of Object.keys(GRADE_NAMES)){
  const now=latest.grades[grade],then=earlier.grades[grade];if(!now||!then)continue;
  const change=Math.round((now.median-then.median)*10)/10,move=Math.abs(change)<FUEL_STEADY_PENCE?'unchanged':`${change<0?'down':'up'} ${Math.abs(change).toFixed(1)}p`;
  const gap=Math.round((Date.parse(latest.day)-Date.parse(earlier.day))/86_400_000),since=gap===7?'a week ago':dayName(earlier.day);
  headlines.push({id:`fuel-${grade}`,kind:'fuel',
   text:`${GRADE_NAMES[grade]}: median ${now.median.toFixed(1)}p a litre, ${move} since ${since}. Cheapest ${now.cheapest.toFixed(1)}p.`,
   note:`Latest recorded day ${dayName(latest.day)}, ${plural(now.stations,'station')} reporting${now.stations!==then.stations?` (${then.stations} on ${dayName(earlier.day)})`:''}. The cheapest price can be Costco, which sells to members only.`});
 }
 return {headlines};
}
export function historyHeadlines(data:HistoryResponse,now=Date.now()):Headlines {
 const items:Headline[]=[],missing:string[]=[],rail=railHeadline(data,now),fuel=fuelHeadlines(data);
 if(rail.headline)items.push(rail.headline);else if(rail.missing)missing.push(rail.missing);
 items.push(...fuel.headlines);if(fuel.missing)missing.push(fuel.missing);
 return {items,missing};
}
