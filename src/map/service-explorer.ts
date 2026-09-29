import {detail,escape,toolSlot} from '../ui/shell';
import {addDays,compareRouteLabels,currentServiceDate,type StopIndex} from '../../shared/timetable';
import {networkAt,nightProfile,type NetworkAtTime,type RouteAtTime,type ServiceSummary} from '../../shared/scheduled-services';
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});
const day=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short'});
const serviceDay=(date:string)=>day.format(Date.UTC(+date.slice(0,4),+date.slice(4,6)-1,+date.slice(6,8),12));
const PRESETS=['18:00','20:00','22:00','00:00','02:00'];
/** A scheduled, network-wide view of one service night, separate from the live bus layer. */
export async function connectServiceExplorer(){
 const section=document.createElement('section');section.className='route-control explorer-control';
 section.innerHTML='<button type="button" class="layer-row explorer-open" disabled><span><i>◷</i>Evening timetable<small>Scheduled</small></span><span aria-hidden="true">↗</span></button>';
 toolSlot('evening').append(section);
 const button=section.querySelector<HTMLButtonElement>('button')!;
 let index:StopIndex;
 try{const r=await fetch('/data/bus-stops.json',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Stop snapshot unavailable');index=await r.json();}
 catch{button.querySelector('small')!.textContent='Unavailable';return;}
 const stopNames=new Map(index.stops.map(s=>[s.id,s.name])),label=(id:string)=>index.routes[id]?.label??id,colour=(id:string)=>index.routes[id]?.colour??'#6b7d75';
 let summary:Promise<ServiceSummary>|undefined,serviceDate:string|undefined,time:string|undefined,highlighted=false;
 const load=()=>summary??=fetch(index.servicesUrl!,{signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw Error('Service summary unavailable');const data:ServiceSummary=await r.json();if(data.schema!==1)throw Error('Invalid service summary');return data;}).catch(error=>{summary=undefined;throw error;});
 const highlight=(ids:string[]|null)=>{highlighted=!!ids;document.dispatchEvent(new CustomEvent('reading-scheduled-routes',{detail:ids}));};
 const journey=(start:number,origin:string,headsign:string)=>`${clock.format(start)} from ${escape(stopNames.get(origin)??origin)} to ${escape(headsign)}`;
 const row=(r:RouteAtTime)=>{
  const chip=`<strong class="explorer-route" style="--route:${escape(colour(r.routeId))}">${escape(label(r.routeId))}</strong>`;
  if(r.state==='finished')return `<li>${chip}<div>Last journey started ${journey(r.last.start,r.last.origin,r.last.headsign)}.</div></li>`;
  const counts=`${r.running?`${r.running} ${r.running===1?'bus':'buses'} on the road`:`Next journey ${journey(r.next!.start,r.next!.origin,r.next!.headsign)}`} · ${r.remaining} more ${r.remaining===1?'journey starts':'journeys start'} before 04:00`;
  const destinations=r.destinations.map(d=>`<small>To ${escape(d.headsign)}: ${d.remaining} more, last ${clock.format(d.last!.start)} from ${escape(stopNames.get(d.last!.origin)??d.last!.origin)}</small>`).join('');
  return `<li>${chip}<div>${counts}${destinations}</div></li>`;
 };
 const chart=(data:ServiceSummary,result:NetworkAtTime,slot:string)=>{
  const points=nightProfile(data,index,result.serviceDate);if(!points.length)return '';
  const max=Math.max(1,...points.map(p=>p.journeys)),width=300,height=86,bar=width/points.length,now=Date.now();
  const bars=points.map((p,i)=>{const h=Math.max(1,p.journeys/max*(height-18));return `<rect data-clock="${p.clock}" x="${(i*bar+.5).toFixed(1)}" y="${(height-14-h).toFixed(1)}" width="${(bar-1).toFixed(1)}" height="${h.toFixed(1)}" class="${p.clock===slot?'selected':''}"><title>${p.clock}: ${p.journeys} ${p.journeys===1?'bus':'buses'} on ${p.routes} ${p.routes===1?'route':'routes'}</title></rect>`;}).join('');
  const nowIndex=points.findIndex((p,i)=>p.at<=now&&now<(points[i+1]?.at??result.nightEnd)),nowMark=nowIndex<0?'':`<line class="now" x1="${(nowIndex+.5)*bar}" x2="${(nowIndex+.5)*bar}" y1="0" y2="${height-14}"/>`;
  const ticks=points.map((p,i)=>p.clock.endsWith(':00')&&+p.clock.slice(0,2)%4===0?`<text x="${i*bar}" y="${height-2}">${p.clock}</text>`:'').join('');
  const peak=points.reduce((a,b)=>b.journeys>a.journeys?b:a),late=points.find(p=>p.clock==='23:00');
  return `<figure class="night-profile"><figcaption>Buses timetabled to be on the road, 16:00 to 04:00</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="From ${peak.journeys} buses at ${peak.clock}${late?` to ${late.journeys} at 23:00`:''}. Select a bar to choose that time.">${bars}${nowMark}${ticks}</svg></figure>`;
 };
 const render=async(element:HTMLElement)=>{
  const start=currentServiceDate(Date.now(),index.timezone),first=start<index.validFrom?index.validFrom:start;
  const dates=Array.from({length:14},(_,i)=>addDays(first,i)).filter(d=>d<=index.validUntil);
  if(!dates.length){element.innerHTML='<p class="schedule-notice">This timetable snapshot has expired, so there is no scheduled service to explore until an updated feed is published.</p>';return;}
  if(!serviceDate||!dates.includes(serviceDate))serviceDate=dates[0];
  time??=clock.format(Date.now()).replace(/\d$/,m=>String(+m<5?0:5));
  let data:ServiceSummary;
  try{data=await load();}catch{element.innerHTML='<p>The scheduled service summary could not load. Open the explorer again to retry.</p>';return;}
  if(!element.isConnected)return;
  const result=networkAt(data,index,serviceDate,time),atLabel=`${time} on the night of ${serviceDay(serviceDate)}`;
  const slot=`${time.slice(0,3)}${String(Math.floor(+time.slice(3)/15)*15).padStart(2,'0')}`;
  const sorted=(state:RouteAtTime['state'])=>result.routes.filter(r=>r.state===state).sort((a,b)=>compareRouteLabels(label(a.routeId),label(b.routeId)));
  const running=sorted('running'),later=sorted('later'),finished=sorted('finished');
  const list=(title:string,routes:RouteAtTime[])=>routes.length?`<h3>${title} <small>${routes.length}</small></h3><ol class="departures explorer-routes">${routes.map(row).join('')}</ol>`:'';
  const active=[...running,...later].map(r=>r.routeId);
  element.innerHTML=`<div class="explorer-controls"><label class="service-date-picker">Night of<select id="explorer-date">${dates.map(d=>`<option value="${d}"${d===serviceDate?' selected':''}>${escape(serviceDay(d))}${d===start?' (tonight)':''}</option>`).join('')}</select></label><label class="service-date-picker">Time<input id="explorer-time" type="time" step="300" value="${time}"></label></div>
   <div class="departure-views" role="group" aria-label="Quick times">${PRESETS.map(p=>`<button type="button" data-explorer-time="${p}" aria-pressed="${p===time}">${p}</button>`).join('')}</div>
   <p class="explorer-note">Times from 00:00 to 03:59 are the early hours after the chosen date, the same night a passenger would mean.</p>
   ${result.state==='partial'?'<p class="schedule-notice">The day before or after this night is outside the timetable snapshot, so journeys that cross into it may be missing.</p>':''}
   ${chart(data,result,slot)}
   <p class="explorer-summary"><strong>At ${escape(atLabel)}</strong>, ${result.onRoad} ${result.onRoad===1?'bus is':'buses are'} timetabled to be on the road across ${running.length} ${running.length===1?'route':'routes'}. ${later.length?`${later.length} more ${later.length===1?'route starts':'routes start'} later tonight. `:''}${finished.length} ${finished.length===1?'route has':'routes have'} finished for the night.</p>
   ${active.length?`<button type="button" class="more-departures" id="explorer-highlight" aria-pressed="${highlighted}">${highlighted?'Show all bus routes again':'Show only these routes on the map'}</button>`:''}
   ${list('On the road',running)}${list('Starts later tonight',later)}${list('Finished for the night',finished)}
   ${running.length||later.length?'<p class="explorer-note">“Last” is the last journey to start before 04:00. Journeys starting in the early hours may belong to the next morning’s timetable, so a late “last” time does not mean the route stops then.</p>':''}
   ${result.notRunning.length?`<p class="explorer-note">No journeys on this night: ${result.notRunning.sort((a,b)=>compareRouteLabels(label(a),label(b))).map(id=>escape(label(id))).join(', ')}.</p>`:''}`;
  const rerender=()=>{if(highlighted)highlight(null);void render(element);};
  element.querySelector<HTMLSelectElement>('#explorer-date')!.addEventListener('change',e=>{serviceDate=(e.currentTarget as HTMLSelectElement).value;rerender();});
  element.querySelector<HTMLInputElement>('#explorer-time')!.addEventListener('change',e=>{const value=(e.currentTarget as HTMLInputElement).value;if(/^\d\d:\d\d$/.test(value)){time=value;rerender();}});
  element.querySelectorAll<HTMLButtonElement>('[data-explorer-time]').forEach(b=>b.addEventListener('click',()=>{time=b.dataset.explorerTime!;rerender();}));
  element.querySelectorAll<SVGRectElement>('.night-profile rect').forEach(r=>r.addEventListener('click',()=>{time=r.dataset.clock!;rerender();}));
  element.querySelector('#explorer-highlight')?.addEventListener('click',()=>{highlight(highlighted?null:active);void render(element);});
 };
 const open=()=>{
  detail(`<span class="pill">Scheduled view · not live</span><h2>Evening timetable</h2><p>Which bus routes the timetable has running at a chosen time of night, and what is left before 04:00. Live buses, delays and cancellations are not part of this view, so the buses on the map can differ.</p><div id="service-explorer" aria-live="polite"><p>Loading the timetable summary…</p></div><small>Counts are timetabled journeys between their first and last stop inside the map. Source: ${escape(index.source)} GTFS${index.version?`, dataset ${escape(index.version)}`:''}. The summary is part of the bundled timetable; opening this view makes no provider calls.</small>`);
  const element=document.querySelector<HTMLElement>('#service-explorer')!;
  if(!index.servicesUrl){element.innerHTML='<p class="schedule-notice">This timetable snapshot was built before the explorer existed. It becomes available after the next timetable refresh.</p>';return;}
  void render(element);
 };
 button.addEventListener('click',open);button.disabled=false;
 if(!index.servicesUrl)button.querySelector('small')!.textContent='After next refresh';
}
