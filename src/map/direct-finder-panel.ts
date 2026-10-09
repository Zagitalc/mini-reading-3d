import type {Map,GeoJSONSource,MapMouseEvent} from 'maplibre-gl';
import {detail,escape,startPick,toolSlot} from '../ui/shell';
import {DEPARTURES_SHOWN,findDirect,nearbyStops,sharedRoutes,type DirectOption,type Nearby} from '../../shared/direct-finder';
import {evidenceBadge} from '../../shared/evidence';
import type {RouteJourneys} from '../../shared/live-departures';
import {compareRouteLabels,timetableStatus,type StopIndex,type StopTimetable} from '../../shared/timetable';
import type {LngLat} from '../../shared/types';
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});
const day=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short'});
const plural=(n:number,one:string,many=one+'s')=>`${n} ${n===1?one:many}`;
const when=(ms:number,now:number)=>`${clock.format(ms)}${day.format(ms)!==day.format(now)?` ${day.format(ms)}`:''}`;
/** "Direct bus": pick a start and a destination on the map and list the scheduled buses that run between stops near them. */
export async function connectDirectFinder(map:Map){
 const section=document.createElement('section');section.className='route-control direct-control';
 section.innerHTML='<button type="button" class="layer-row direct-open" disabled><span><i>↔</i>Direct bus<small>From and to</small></span><span aria-hidden="true">↗</span></button>';
 toolSlot('direct').append(section);
 const button=section.querySelector<HTMLButtonElement>('button')!;
 let index:StopIndex;
 try{const r=await fetch('/data/bus-stops.json',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Stop snapshot unavailable');index=await r.json();}
 catch{button.querySelector('small')!.textContent='Unavailable';return;}
 button.disabled=false;
 const label=(id:string)=>index.routes[id]?.label??id,colour=(id:string)=>index.routes[id]?.colour??'#6b7d75';
 const files=new globalThis.Map<string,Promise<unknown>>();
 const get=<T,>(url:string,check:(d:T)=>boolean)=>{let p=files.get(url) as Promise<T>|undefined;if(!p){p=fetch(url,{signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw Error('Missing file');const d:T=await r.json();if(!check(d))throw Error('Invalid file');return d;}).catch(e=>{files.delete(url);throw e;});files.set(url,p);if(files.size>60)files.delete(files.keys().next().value!);}return p;};
 map.addSource('direct-points',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
 map.addLayer({id:'direct-points',type:'circle',source:'direct-points',paint:{'circle-radius':9,'circle-color':['match',['get','end'],'from','#25483e','#8a4b2a'],'circle-stroke-color':'#fffdf5','circle-stroke-width':3}});
 map.addLayer({id:'direct-labels',type:'symbol',source:'direct-points',layout:{'text-field':['get','end'],'text-font':['Noto Sans Regular'],'text-size':11,'text-offset':[0,-1.6]},paint:{'text-color':'#25483e','text-halo-color':'#fffdf5','text-halo-width':2}});
 let from:LngLat|undefined,to:LngLat|undefined,run=0;
 const draw=()=>(map.getSource('direct-points') as GeoJSONSource).setData({type:'FeatureCollection',features:[from&&{type:'Feature' as const,geometry:{type:'Point' as const,coordinates:from},properties:{end:'from'}},to&&{type:'Feature' as const,geometry:{type:'Point' as const,coordinates:to},properties:{end:'to'}}].filter(Boolean) as never[]});
 const walk=(n:Nearby)=>`${escape(n.stop.name)}${n.stop.code?` (${escape(n.stop.code)})`:''}, ${n.metres} m`;
 const row=(o:DirectOption,now:number)=>`<li class="direct-option"><div><strong style="color:${escape(colour(o.routeId))}">${escape(label(o.routeId))}</strong> to ${escape(o.headsign||'terminus')}<small>Board at ${walk(o.from)} from the start. Get off at ${walk(o.to)} from the destination. About ${o.rideMinutes} min on the bus.</small></div><ol class="direct-times">${o.departures.map(d=>`<li><time datetime="${new Date(d.departs).toISOString()}">${when(d.departs,now)}</time><small>arrives ${when(d.arrives,now)}${d.approximate?' (approx.)':''}</small></li>`).join('')}</ol></li>`;
 const render=()=>{
  const el=document.querySelector<HTMLElement>('#direct-view');if(!el)return;
  const pick=(id:'from'|'to')=>`<button type="button" class="status-button" data-pick="${id}">${(id==='from'?from:to)?'Change':'Choose'} ${id==='from'?'start':'destination'} on the map</button>`;
  el.innerHTML=`<p class="explorer-note">Direct means one bus calls at a stop near each point, in that order, with no change. Walks are straight-line distances, not street routes.</p><div class="direct-picks"><p><strong>From</strong> ${from?`${from[1].toFixed(4)}, ${from[0].toFixed(4)}`:'not chosen'} ${pick('from')}</p><p><strong>To</strong> ${to?`${to[1].toFixed(4)}, ${to[0].toFixed(4)}`:'not chosen'} ${pick('to')}</p></div><div id="direct-results" aria-live="polite"></div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.pick as 'from'|'to')));
  void search();
 };
 const choose=(end:'from'|'to')=>{
  map.getCanvas().style.cursor='crosshair';
  const picked=(e:MapMouseEvent)=>{done();map.getCanvas().style.cursor='';if(end==='from')from=[e.lngLat.lng,e.lngLat.lat];else to=[e.lngLat.lng,e.lngLat.lat];draw();open();};
  const done=startPick(end==='from'?'Tap the map where you start':'Tap the map where you want to go',()=>{map.off('click',picked);map.getCanvas().style.cursor='';open();});
  map.once('click',picked);
 };
 async function search(){
  const out=document.querySelector<HTMLElement>('#direct-results');if(!out||!from||!to)return;
  const id=++run,now=Date.now(),status=timetableStatus(index,now);
  out.innerHTML='<p class="explorer-note">Looking for direct buses…</p>';
  const origins=nearbyStops(index.stops,from),dests=nearbyStops(index.stops,to),routes=sharedRoutes(origins,dests).filter(r=>index.routes[r]?.journeysUrl);
  const stale=status.state==='expired'?'<p class="schedule-notice">The timetable snapshot has expired, so the times below may be wrong.</p>':'';
  const none=(why:string)=>out.innerHTML=`${stale}<p>No direct bus found between nearby stops.</p><p class="explorer-note">${why}</p>`;
  if(!origins.length||!dests.length){none(`${!origins.length?'No bus stop is within 800 m of the start. ':''}${!dests.length?'No bus stop is within 800 m of the destination.':''}`);return;}
  if(!routes.length){none('No route calls near both points, so the trip needs a change. This finder does not plan changes.');return;}
  try{
   const [journeys,timetables]=await Promise.all([
    Promise.all(routes.map(async r=>[r,await get<RouteJourneys>(index.routes[r].journeysUrl!,d=>d.schema===1&&d.routeId===r)] as const)),
    Promise.all(origins.filter(o=>o.stop.timetableUrl&&o.stop.routeIds.some(r=>routes.includes(r))).map(async o=>({walk:o,data:await get<StopTimetable>(o.stop.timetableUrl!,d=>d.schema===1&&d.stopId===o.stop.id)})))]);
   if(id!==run||!out.isConnected)return;
   const options=findDirect({origins:timetables,destinations:dests,journeys:new globalThis.Map(journeys),now}).sort((a,b)=>a.departures[0].departs-b.departures[0].departs||compareRouteLabels(label(a.routeId),label(b.routeId)));
   if(!options.length){none('Nothing runs in the next six hours, or the buses that serve both ends do not call at them in that order.');return;}
   out.innerHTML=`${stale}<p>${plural(options.length,'direct option')}, next ${DEPARTURES_SHOWN} scheduled departures each. Scheduled times, not live: delays and cancellations are not included.</p><ul class="direct-list">${options.slice(0,12).map(o=>row(o,now)).join('')}</ul>${options.length>12?`<p class="explorer-note">${options.length-12} more not shown.</p>`:''}`;
  }catch{if(id===run&&out.isConnected)out.innerHTML='<p class="schedule-notice">Timetable files could not load. Try again in a moment.</p>';}
 }
 function open(){detail(`<span class="pill">Bus · scheduled</span>${evidenceBadge('scheduled')}<h2>Direct bus finder</h2><div id="direct-view"></div>`);render();}
 button.addEventListener('click',open);
}
