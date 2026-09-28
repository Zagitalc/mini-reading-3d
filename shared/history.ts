import type {FeedStatus,FuelStation} from './types';
import type {StationBoard} from './rail-board';
/** "Reading over time": one sample a minute, rolled into one stored row per UTC hour, plus one fuel row per London day.
 * Hours with no sample stay absent, so a gap in a chart means "not recorded", never zero. */
export const HISTORY_SCHEMA=1;
export const HISTORY_FEEDS=['trains','weather','fuel','rivers','traffic','roadworks'] as const;
/** A departure counts as late at five minutes, the threshold used for rail punctuality. */
export const LATE_MINUTES=5;
/** Departures are recorded once they are this close to leaving, so the status kept is near final. */
const RAIL_LOOKAHEAD_MS=15*60_000;
type Count={minutes:number;sum:number;min:number;max:number};
/** Last status seen for one departure: [scheduled HH:mm, delay minutes (-1 = delayed, no estimate), cancelled 0/1]. */
export type RailEntry=[string,number,0|1];
export interface HourRecord {
 schema:1;hour:string;
 /** Minutes the recorder ran in this hour. */
 minutes:number;
 /** Only minutes with a bus snapshot under two minutes old; buses refresh while someone has the map open. */
 buses:Count&{routesSum:number};
 trains:Count;
 /** Reading station departures scheduled in this hour, keyed by Darwin service id. */
 rail:Record<string,RailEntry>;
 feeds:Record<string,Partial<Record<FeedStatus['state'],number>>>;
}
export interface MinuteInput {
 now:number;
 /** Fresh bus snapshot, or null when nobody has refreshed buses recently. */
 buses:{count:number;routes:number}|null;
 trains:{count:number}|null;
 board:StationBoard|null;
 feeds:FeedStatus[];
}
export const hourKey=(t:number)=>new Date(Math.floor(t/3_600_000)*3_600_000).toISOString().slice(0,13)+':00Z';
export const emptyHour=(hour:string):HourRecord=>({schema:1,hour,minutes:0,buses:{minutes:0,sum:0,min:0,max:0,routesSum:0},trains:{minutes:0,sum:0,min:0,max:0},rail:{},feeds:{}});
const add=(c:Count,v:number)=>{c.min=c.minutes?Math.min(c.min,v):v;c.max=c.minutes?Math.max(c.max,v):v;c.minutes++;c.sum+=v;};
const london=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function londonParts(t:number){const p=Object.fromEntries(london.formatToParts(t).map(x=>[x.type,x.value]));return {y:+p.year,m:+p.month,d:+p.day,h:+p.hour,min:+p.minute};}
/** London calendar date, YYYY-MM-DD. */
export const londonDay=(t:number)=>{const p=londonParts(t);return `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;};
/** The instant of a London HH:mm nearest to `near` (boards cross midnight). */
export function londonClock(hhmm:string,near:number):number|undefined {
 const match=/^(\d\d):(\d\d)$/.exec(hhmm);if(!match)return undefined;
 const p=londonParts(near),offset=Date.UTC(p.y,p.m-1,p.d,p.h,p.min)-Math.floor(near/60_000)*60_000;
 const base=Date.UTC(p.y,p.m-1,p.d,+match[1],+match[2])-offset;
 return [base-86_400_000,base,base+86_400_000].reduce((a,b)=>Math.abs(b-near)<Math.abs(a-near)?b:a);
}
/** Darwin's "expected" text as delay minutes: 0 on time, -1 delayed without an estimate. */
export function delayMinutes(scheduled:string,expected:string,near:number):number {
 if(expected==='On time')return 0;
 const s=londonClock(scheduled,near),e=/^\d\d:\d\d$/.test(expected)&&s!==undefined?londonClock(expected,s):undefined;
 return s!==undefined&&e!==undefined?Math.max(0,Math.round((e-s)/60_000)):-1;
}
/** Folds one minute into the hour rows it touches: the current hour, and the hour each near departure is scheduled in. */
export function applyMinute(rows:Map<string,HourRecord>,input:MinuteInput):string[] {
 const touched=new Set<string>(),row=(key:string)=>{let r=rows.get(key);if(!r){r=emptyHour(key);rows.set(key,r);}touched.add(key);return r;};
 const current=row(hourKey(input.now));current.minutes++;
 if(input.buses){add(current.buses,input.buses.count);current.buses.routesSum+=input.buses.routes;}
 if(input.trains)add(current.trains,input.trains.count);
 for(const f of input.feeds){if(!(HISTORY_FEEDS as readonly string[]).includes(f.id))continue;const c=current.feeds[f.id]??={};c[f.state]=(c[f.state]??0)+1;}
 const generated=input.board?Date.parse(input.board.generatedAt):NaN;
 // A board older than five minutes says nothing reliable about the current minute.
 if(input.board&&input.now-generated<5*60_000)for(const d of input.board.services){
  const at=londonClock(d.scheduled,input.now);if(at===undefined||at-input.now>RAIL_LOOKAHEAD_MS)continue;
  row(hourKey(at)).rail[d.id]=[d.scheduled,d.cancelled?0:delayMinutes(d.scheduled,d.expected,input.now),d.cancelled?1:0];
 }
 return [...touched];
}
export interface HourSummary {
 hour:string;minutes:number;
 buses:{minutes:number;mean:number;max:number;routes:number}|null;
 trains:{minutes:number;mean:number;max:number}|null;
 rail:{departures:number;onTime:number;late:number;cancelled:number;worstDelay:number};
 /** Share of recorded minutes each feed was live, 0 to 1. */
 feeds:Record<string,number>;
}
const round=(v:number)=>Math.round(v*10)/10;
export function summariseHour(r:HourRecord):HourSummary {
 const rail=Object.values(r.rail),late=rail.filter(([,d,c])=>!c&&(d<0||d>=LATE_MINUTES)).length,cancelled=rail.filter(([,,c])=>c).length;
 return {hour:r.hour,minutes:r.minutes,
  buses:r.buses.minutes?{minutes:r.buses.minutes,mean:round(r.buses.sum/r.buses.minutes),max:r.buses.max,routes:round(r.buses.routesSum/r.buses.minutes)}:null,
  trains:r.trains.minutes?{minutes:r.trains.minutes,mean:round(r.trains.sum/r.trains.minutes),max:r.trains.max}:null,
  rail:{departures:rail.length,onTime:rail.length-late-cancelled,late,cancelled,worstDelay:Math.max(0,...rail.map(([,d])=>d))},
  feeds:Object.fromEntries(Object.entries(r.feeds).map(([id,c])=>{const total=Object.values(c).reduce((a,b)=>a+(b??0),0);return [id,total?Math.round((c.live??0)/total*100)/100:0];}))};
}
export interface FuelGrade {stations:number;cheapest:number;median:number;dearest:number;cheapestIds:string[]}
export interface FuelDay {
 schema:1;day:string;recordedAt:string;
 /** The source snapshot time; each station price also keeps its own submission time. */
 observedAt:string;
 grades:Record<string,FuelGrade>;
 stations:{id:string;name:string;brand:string;postcode:string;prices:FuelStation['prices']}[];
}
const median=(v:number[])=>{const s=[...v].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:round((s[m-1]+s[m])/2);};
/** A day's fuel prices, whole, so later work can compare stations as well as the town's spread. */
export function fuelDay(stations:FuelStation[],now:number):FuelDay|null {
 if(!stations.length)return null;
 const byGrade=new Map<string,{id:string;pence:number}[]>();
 for(const s of stations)for(const [grade,p] of Object.entries(s.prices))(byGrade.get(grade)??byGrade.set(grade,[]).get(grade)!).push({id:s.id,pence:p.pence});
 const grades=Object.fromEntries([...byGrade].sort().map(([grade,list])=>{const values=list.map(x=>x.pence),cheapest=Math.min(...values);
  return [grade,{stations:list.length,cheapest,median:median(values),dearest:Math.max(...values),cheapestIds:list.filter(x=>x.pence===cheapest).map(x=>x.id)}];}));
 const observedAt=stations.map(s=>s.observedAt).sort().at(-1)!;
 return {schema:1,day:londonDay(now),recordedAt:new Date(now).toISOString(),observedAt,grades,stations:stations.map(s=>({id:s.id,name:s.name,brand:s.brand,postcode:s.postcode,prices:s.prices}))};
}
export interface HistoryResponse {version:1;generatedAt:string;from:string;recordingSince:string|null;hours:HourSummary[];fuel:Omit<FuelDay,'stations'>[]}
export const HISTORY_MAX_DAYS=14;
/** Distinct routes among observations, for the bus sample. */
export const routeCount=(items:{routeGroupId?:string;routeId?:string}[])=>new Set(items.map(o=>o.routeGroupId??o.routeId).filter(Boolean)).size;
/** Storage the recorder needs; D1 in the Worker, node:sqlite locally. */
export interface HistoryStore {
 hours(keys:string[]):Promise<HourRecord[]>;
 saveHours(rows:HourRecord[]):Promise<void>;
 fuelObservedAt(day:string):Promise<string|undefined>;
 saveFuel(day:FuelDay):Promise<void>;
 range(fromHour:string,fromDay:string):Promise<{hours:HourRecord[];fuel:FuelDay[];since:string|null}>;
}
/** Records one minute. Callers guarantee at most one call per wall-clock minute. */
export async function recordMinute(store:HistoryStore,input:MinuteInput,fuel:FuelStation[]) {
 const rows=new Map<string,HourRecord>(),wanted=new Set([hourKey(input.now),hourKey(input.now+RAIL_LOOKAHEAD_MS)]);
 for(const r of await store.hours([...wanted]))if(r.schema===HISTORY_SCHEMA)rows.set(r.hour,r);
 const touched=applyMinute(rows,input);
 await store.saveHours(touched.map(k=>rows.get(k)!));
 // The day's row follows the newest source snapshot seen that day, so it ends the day with the evening prices.
 const day=fuelDay(fuel,input.now);
 if(day&&day.observedAt>((await store.fuelObservedAt(day.day))??''))await store.saveFuel(day);
}
export async function historyResponse(store:HistoryStore,days:number,now=Date.now()):Promise<HistoryResponse> {
 const span=Math.min(HISTORY_MAX_DAYS,Math.max(1,Math.round(days)||7)),from=hourKey(now-span*86_400_000+3_600_000);
 const data=await store.range(from,londonDay(now-span*86_400_000));
 return {version:1,generatedAt:new Date(now).toISOString(),from,recordingSince:data.since,
  hours:data.hours.filter(h=>h.schema===HISTORY_SCHEMA).sort((a,b)=>a.hour.localeCompare(b.hour)).map(summariseHour),
  fuel:data.fuel.sort((a,b)=>a.day.localeCompare(b.day)).map(({stations:_,...day})=>day)};
}
