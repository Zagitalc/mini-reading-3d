import {detail,escape,toolSlot} from '../ui/shell';
import type {HistoryResponse,HourSummary} from '../../shared/history';
import {historyHeadlines} from '../../shared/history-headlines';
const hourLabel=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});
const weekday=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short'});
const dayLabel=(day:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(Date.parse(day+'T12:00:00Z'));
const GRADES:Record<string,string>={E10:'Petrol E10',B7S:'Diesel',E5:'Super unleaded E5',B7P:'Premium diesel'};
const FEEDS:Record<string,string>={trains:'Trains',weather:'Weather',fuel:'Fuel prices',rivers:'Rivers'};
const W=300,H=90,BASE=H-14;
type Slot={at:number;hour?:HourSummary};
const plural=(n:number,one:string,many=one+'s')=>`${n} ${n===1?one:many}`;
/** One slot per hour of the range, so unrecorded hours stay visible as gaps. */
function slots(data:HistoryResponse,now:number):Slot[] {
 const byHour=new Map(data.hours.map(h=>[h.hour,h])),start=Date.parse(data.from),out:Slot[]=[];
 for(let at=start;at<=now;at+=3_600_000)out.push({at,hour:byHour.get(new Date(at).toISOString().slice(0,13)+':00Z')});
 return out;
}
function ticks(list:Slot[],bar:number,days:number){
 return list.map((s,i)=>{const h=+clock.format(s.at).slice(0,2);
  if(days>1?h!==0:h%6!==0)return '';
  return `<line class="tick" x1="${(i*bar).toFixed(1)}" x2="${(i*bar).toFixed(1)}" y1="0" y2="${BASE}"/><text x="${(i*bar+2).toFixed(1)}" y="${H-2}">${days>1?weekday.format(s.at):clock.format(s.at)}</text>`;}).join('');
}
function busChart(list:Slot[],days:number){
 const values=list.filter(s=>s.hour?.buses);if(!values.length)return '<p class="explorer-note">No bus readings yet. Buses are sampled only while someone has the map open.</p>';
 const max=Math.max(1,...values.map(s=>s.hour!.buses!.max)),bar=W/list.length;
 const bars=list.map((s,i)=>{const b=s.hour?.buses;if(!b)return '';const h=Math.max(1,b.mean/max*(BASE-6));
  return `<rect x="${(i*bar+.3).toFixed(1)}" y="${(BASE-h).toFixed(1)}" width="${Math.max(.6,bar-.6).toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(2,bar/3).toFixed(1)}"><title>${hourLabel.format(s.at)}: ${b.mean} buses on average, up to ${b.max}, on about ${Math.round(b.routes)} routes (${plural(b.minutes,'minute')} sampled)</title></rect>`;}).join('');
 const peak=values.reduce((a,b)=>b.hour!.buses!.mean>a.hour!.buses!.mean?b:a);
 return `<figure class="history-chart buses"><figcaption>Buses on the road, hourly average</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Busiest recorded hour ${hourLabel.format(peak.at)} with ${peak.hour!.buses!.mean} buses on average.">${ticks(list,bar,days)}<text class="scale" x="${W}" y="8" text-anchor="end">${max}</text>${bars}<line class="base" x1="0" x2="${W}" y1="${BASE}" y2="${BASE}"/></svg></figure>`;
}
function railChart(list:Slot[],days:number){
 const values=list.filter(s=>s.hour?.rail.departures);if(!values.length)return '<p class="explorer-note">No Reading station departures recorded yet.</p>';
 const max=Math.max(1,...values.map(s=>s.hour!.rail.departures)),bar=W/list.length,unit=(BASE-6)/max;
 const bars=list.map((s,i)=>{const r=s.hour?.rail;if(!r?.departures)return '';let y=BASE;
  const parts=([['on-time',r.onTime],['late',r.late],['cancelled',r.cancelled]] as const).filter(([,n])=>n).map(([cls,n])=>{const h=n*unit;y-=h;return `<rect class="${cls}" x="${(i*bar+.3).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(.6,bar-.6).toFixed(1)}" height="${Math.max(.5,h-.5).toFixed(1)}"/>`;}).join('');
  return `<g>${parts}<title>${hourLabel.format(s.at)}: ${plural(r.departures,'departure')}, ${r.onTime} on time, ${r.late} late, ${r.cancelled} cancelled${r.worstDelay?`; worst delay ${r.worstDelay} min`:''}</title></g>`;}).join('');
 const total=values.reduce((a,s)=>({d:a.d+s.hour!.rail.departures,l:a.l+s.hour!.rail.late,c:a.c+s.hour!.rail.cancelled}),{d:0,l:0,c:0});
 return `<figure class="history-chart rail"><figcaption>Reading station departures by hour</figcaption><div class="history-legend"><span class="on-time">On time</span><span class="late">5+ min late</span><span class="cancelled">Cancelled</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${total.d} departures recorded: ${total.l} late and ${total.c} cancelled.">${ticks(list,bar,days)}<text class="scale" x="${W}" y="8" text-anchor="end">${max}</text>${bars}<line class="base" x1="0" x2="${W}" y1="${BASE}" y2="${BASE}"/></svg></figure>`;
}
function feedChart(list:Slot[],days:number){
 const ids=Object.keys(FEEDS).filter(id=>list.some(s=>s.hour?.feeds[id]!==undefined));if(!ids.length)return '';
 const bar=W/list.length,row=13,height=ids.length*row+14;
 const rows=ids.map((id,r)=>`<text class="feed-name" x="0" y="${r*row+9}">${FEEDS[id]}</text>`+list.map((s,i)=>{const v=s.hour?.feeds[id];if(v===undefined)return '';
  const cls=v>=.95?'up':v>=.5?'patchy':'down';return `<rect class="${cls}" x="${(70+i*bar*(W-70)/W).toFixed(1)}" y="${r*row+1}" width="${Math.max(.6,bar*(W-70)/W-.4).toFixed(1)}" height="${row-3}"><title>${FEEDS[id]}, ${hourLabel.format(s.at)}: live ${Math.round(v*100)}% of recorded minutes</title></rect>`;}).join('')).join('');
 return `<figure class="history-chart feeds"><figcaption>Feed health, share of each hour a feed was live</figcaption><div class="history-legend"><span class="up">Live all hour</span><span class="patchy">Partly</span><span class="down">Mostly down</span></div><svg viewBox="0 0 ${W} ${height}" role="img" aria-label="Feed health by hour for ${ids.map(id=>FEEDS[id]).join(', ')}.">${rows}</svg></figure>`;
}
/** Fuel range shown, in days; the table stays short whatever the range. */
let fuelRange=7;
const FUEL_RANGES=[7,30] as const,TABLE_DAYS=7;
const addDays=(day:string,by:number)=>new Date(Date.parse(day+'T12:00:00Z')+by*86_400_000).toISOString().slice(0,10);
function fuelBlock(data:HistoryResponse,range:number){
 if(!data.fuel.length)return '<p class="explorer-note">No fuel prices recorded yet. The first daily snapshot is taken once the fuel feed has refreshed.</p>';
 const latest=data.fuel.at(-1)!,shown=data.fuel.filter(d=>d.day>addDays(latest.day,-range));
 const grades=['E10','B7S'].filter(g=>shown.some(d=>d.grades[g]));
 const picker=`<div class="departure-views" role="group" aria-label="Fuel range">${FUEL_RANGES.map(d=>`<button type="button" data-fuel-range="${d}" aria-pressed="${d===range}">${d} days of fuel</button>`).join('')}</div>`;
 let chart='';
 if(shown.length>1&&grades.length){
  const values=shown.flatMap(d=>grades.flatMap(g=>d.grades[g]?[d.grades[g].median]:[])),lo=Math.floor(Math.min(...values)-1),hi=Math.ceil(Math.max(...values)+1);
  const x=(i:number)=>12+i*(W-70)/(shown.length-1),y=(v:number)=>6+(hi-v)/(hi-lo)*(BASE-12),r=shown.length>10?2.5:4;
  const lines=grades.map(g=>{const pts=shown.map((d,i)=>d.grades[g]?[x(i),y(d.grades[g].median),d] as const:null).filter(p=>p!==null);const last=pts.at(-1);
   return `<g class="grade ${g}"><polyline points="${pts.map(p=>`${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}"/>${pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${r}"><title>${GRADES[g]}, ${dayLabel(p[2].day)}: median ${p[2].grades[g].median}p, cheapest ${p[2].grades[g].cheapest}p across ${p[2].grades[g].stations} stations (prices as of ${hourLabel.format(Date.parse(p[2].observedAt))})</title></circle>`).join('')}${last?`<text class="direct" x="${(last[0]+7).toFixed(1)}" y="${(last[1]+3).toFixed(1)}">${GRADES[g]}</text>`:''}</g>`;}).join('');
  chart=`<figure class="history-chart fuel"><figcaption>Median pump price in Reading, pence per litre</figcaption><div class="history-legend">${grades.map(g=>`<span class="${g}">${GRADES[g]}</span>`).join('')}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily median fuel prices over ${shown.length} days."><text class="scale" x="0" y="8">${hi}p</text><text class="scale" x="0" y="${BASE}">${lo}p</text>${lines}</svg></figure>`;
 }
 // One row per day with petrol and diesel side by side: seven rows, the rest behind a button.
 const cell=(d:typeof shown[number],g:string,k:'cheapest'|'median')=>d.grades[g]?`${d.grades[g][k]}p`:'—';
 const rows=[...shown].reverse().map((d,i)=>`<tr${i>=TABLE_DAYS?' class="older" hidden':''}><td>${escape(dayLabel(d.day))}</td><td>${cell(d,'E10','cheapest')}</td><td>${cell(d,'E10','median')}</td><td>${cell(d,'B7S','cheapest')}</td><td>${cell(d,'B7S','median')}</td></tr>`).join('');
 const older=shown.length-TABLE_DAYS;
 return `${picker}${chart}<table class="history-table"><caption>Daily fuel snapshot, petrol E10 and diesel. Latest prices as of ${escape(hourLabel.format(Date.parse(latest.observedAt)))}. Includes Costco, which sells fuel to members only.</caption><thead><tr><th rowspan="2">Day</th><th colspan="2">Petrol E10</th><th colspan="2">Diesel</th></tr><tr><th>Cheapest</th><th>Median</th><th>Cheapest</th><th>Median</th></tr></thead><tbody>${rows}</tbody></table>${older>0?`<button type="button" class="status-button" data-fuel-older aria-expanded="false">Show ${plural(older,'older day')}</button>`:''}`;
}
function dailyTable(data:HistoryResponse){
 const days=new Map<string,HourSummary[]>();
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'});
 for(const h of data.hours){const key=day.format(Date.parse(h.hour));(days.get(key)??days.set(key,[]).get(key)!).push(h);}
 const rows=[...days].reverse().map(([d,hours])=>{const bus=hours.filter(h=>h.buses),rail=hours.reduce((a,h)=>({d:a.d+h.rail.departures,l:a.l+h.rail.late,c:a.c+h.rail.cancelled}),{d:0,l:0,c:0});
  return `<tr><td>${escape(dayLabel(d))}</td><td>${hours.length} h</td><td>${bus.length?Math.max(...bus.map(h=>h.buses!.max)):'—'}</td><td>${rail.d}</td><td>${rail.l}</td><td>${rail.c}</td></tr>`;}).join('');
 return `<details class="history-details"><summary>Show daily figures as a table</summary><table class="history-table"><caption>Most buses is the highest count in any sampled minute; days with few map viewers have fewer bus samples.</caption><thead><tr><th>Day</th><th>Recorded</th><th>Most buses</th><th>Departures</th><th>Late</th><th>Cancelled</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}
/** The headlines need yesterday and a week of fuel days, so they always read the seven-day history, whichever range is charted. */
function headlinesBlock(data:HistoryResponse|undefined){
 if(!data)return '<p class="explorer-note">Headlines could not be worked out because the seven-day history did not load.</p>';
 const {items,missing}=historyHeadlines(data);
 return `<section class="history-headlines" aria-label="Headlines"><h3>Headlines</h3>${items.length?`<ul>${items.map(i=>`<li class="${i.kind}">${escape(i.text)}<small>${escape(i.note??'')}</small></li>`).join('')}</ul>`:''}${missing.map(m=>`<p class="explorer-note">${escape(m)}</p>`).join('')}<p class="explorer-note">Rail and fuel only. Bus counts are not compared because buses are recorded only while someone has the map open.</p></section>`;
}
function render(element:HTMLElement,data:HistoryResponse,days:number,week:HistoryResponse|undefined){
 const now=Date.now(),list=slots(data,now),recorded=data.hours.length;
 element.innerHTML=`<div class="departure-views" role="group" aria-label="Time range">${[1,7].map(d=>`<button type="button" data-history-days="${d}" aria-pressed="${d===days}">${d===1?'Last 24 hours':'Last 7 days'}</button>`).join('')}</div>
  ${headlinesBlock(week)}
  ${data.recordingSince?`<p class="explorer-note">Recording since ${escape(hourLabel.format(Date.parse(data.recordingSince)))}. ${plural(recorded,'hour')} recorded in this range; hours without a bar were not recorded.</p>`:'<p class="schedule-notice">Nothing has been recorded yet. The first hourly figures appear a minute after recording starts.</p>'}
  ${busChart(list,days)}${railChart(list,days)}${feedChart(list,days)}<div id="history-fuel">${fuelBlock(data,fuelRange)}</div>${recorded?dailyTable(data):''}`;
 const fuel=element.querySelector<HTMLElement>('#history-fuel');
 const wireFuel=()=>{if(!fuel)return;
  fuel.querySelectorAll<HTMLButtonElement>('[data-fuel-range]').forEach(b=>b.addEventListener('click',()=>{fuelRange=+b.dataset.fuelRange!;fuel.innerHTML=fuelBlock(data,fuelRange);wireFuel();}));
  fuel.querySelector<HTMLButtonElement>('[data-fuel-older]')?.addEventListener('click',e=>{const b=e.currentTarget as HTMLButtonElement,open=b.getAttribute('aria-expanded')!=='true',n=fuel.querySelectorAll('tr.older').length;
   fuel.querySelectorAll<HTMLElement>('tr.older').forEach(r=>r.hidden=!open);b.setAttribute('aria-expanded',String(open));b.textContent=open?'Hide older days':`Show ${plural(n,'older day')}`;});};
 wireFuel();
 element.querySelectorAll<HTMLButtonElement>('[data-history-days]').forEach(b=>b.addEventListener('click',()=>void load(element,+b.dataset.historyDays!)));
}
async function fetchHistory(days:number){
 const r=await fetch(`/api/v1/history?days=${days}&fuelDays=30`,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('History unavailable');return await r.json() as HistoryResponse;
}
async function load(element:HTMLElement,days:number){
 try{const data=await fetchHistory(days),week=days===7?data:await fetchHistory(7).catch(()=>undefined);if(element.isConnected)render(element,data,days,week);}
 catch{if(element.isConnected)element.innerHTML='<p>The recorded history could not load. Open this view again to retry.</p>';}
}
/** Recorded hourly figures for buses, trains, feed health and daily fuel prices. */
export function connectHistoryPanel(){
 const section=document.createElement('section');section.className='route-control history-control';
 section.innerHTML='<button type="button" class="layer-row history-open"><span><i>▃</i>Reading over time<small>Recorded</small></span><span aria-hidden="true">↗</span></button>';
 toolSlot('history').append(section);
 section.querySelector('button')!.addEventListener('click',()=>{
  detail(`<span class="pill">Recorded history · hourly</span><h2>Reading over time</h2><p>How Reading’s buses, trains and data feeds behaved hour by hour, and what fuel cost each day, from figures the map saves as it runs.</p><div id="history-view" aria-live="polite"><p>Loading the recorded history…</p></div>
   <small>A sample is taken once a minute from the data the map already holds, so recording makes no extra provider calls. Buses refresh only while someone has the map open, which leaves gaps overnight. Trains are estimated positions; departures come from the Reading station board as each train is about to leave, and count as late at five minutes. Fuel is the day’s newest price snapshot; each station keeps its own submission time.</small>`);
  void load(document.querySelector<HTMLElement>('#history-view')!,7);
 });
}
