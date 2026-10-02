import type {Map,GeoJSONSource} from 'maplibre-gl';
import {detail,escape,toolSlot} from '../ui/shell';
import {subscribeVehicles} from './vehicle-feed';
import {addDays,compareRouteLabels,currentServiceDate,type StopIndex} from '../../shared/timetable';
import type {ServiceSummary} from '../../shared/scheduled-services';
import {LIVE_MAX_AGE_MS,type RouteJourneys} from '../../shared/live-departures';
import {ASSUMPTIONS,HEADWAY_LIMITS,frequencyScenario,positionAt,type ScenarioInput,type ScenarioResult,type Waits} from '../../shared/scenarios';
import type {VehicleObservation} from '../../shared/types';
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});
const day=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short'});
const serviceDay=(date:string)=>day.format(Date.UTC(+date.slice(0,4),+date.slice(4,6)-1,+date.slice(6,8),12));
const minutes=(m:number)=>Number.isFinite(m)?`${m<10?Math.round(m*10)/10:Math.round(m)} min`:'no bus';
const signed=(n:number,unit=(v:number)=>String(v))=>!Number.isFinite(n)?'—':n===0?'no change':`${n>0?'+':'−'}${unit(Math.abs(n))}`;
const plural=(n:number,one:string,many=one+'s')=>`${n} ${n===1?one:many}`;
const EMPTY={type:'FeatureCollection' as const,features:[]};
/** "What if" frequency scenarios: the timetable as it is, next to the same route at an even interval. */
export async function connectScenarios(map:Map){
 const section=document.createElement('section');section.className='route-control scenario-control';
 section.innerHTML='<button type="button" class="layer-row scenario-open" disabled><span><i>⇄</i>What if…<small>Scenario</small></span><span aria-hidden="true">↗</span></button>';
 toolSlot('scenario').append(section);
 const button=section.querySelector<HTMLButtonElement>('button')!;
 let index:StopIndex;
 try{const r=await fetch('/data/bus-stops.json',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Stop snapshot unavailable');index=await r.json();}
 catch{button.querySelector('small')!.textContent='Unavailable';return;}
 const routeIds=Object.keys(index.routes).filter(id=>index.routes[id].journeysUrl).sort((a,b)=>compareRouteLabels(index.routes[a].label,index.routes[b].label));
 if(!index.servicesUrl||!routeIds.length){button.querySelector('small')!.textContent='After next refresh';return;}
 const stopNames=new globalThis.Map(index.stops.map(s=>[s.id,s.name])),label=(id:string)=>index.routes[id]?.label??id,colour=(id:string)=>index.routes[id]?.colour??'#6b7d75';
 let summary:Promise<ServiceSummary>|undefined;const routeData=new globalThis.Map<string,Promise<RouteJourneys>>();
 const load=()=>summary??=fetch(index.servicesUrl!,{signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw Error('Service summary unavailable');const data:ServiceSummary=await r.json();if(data.schema!==1)throw Error('Invalid service summary');return data;}).catch(error=>{summary=undefined;throw error;});
 const journeysFor=(id:string)=>{let p=routeData.get(id);if(!p){p=fetch(index.routes[id].journeysUrl!,{signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw Error('Journeys unavailable');const data:RouteJourneys=await r.json();if(data.schema!==1||data.routeId!==id)throw Error('Invalid journeys');return data;}).catch(error=>{routeData.delete(id);throw error;});routeData.set(id,p);}return p;};
 // Positions stop arriving while the bus layer is off, so an old snapshot is not passed off as "right now".
 let live:VehicleObservation[]|null=null,liveAt=0;subscribeVehicles(u=>{live=u.vehicles;liveAt=u.at;});
 // Map drawing: hollow grey dots for today's timetable, filled route-coloured dots for the scenario.
 const drawn=()=>map.getSource('scenario-buses') as GeoJSONSource|undefined;
 const ensureLayer=()=>{if(drawn())return;map.addSource('scenario-route',{type:'geojson',data:EMPTY});map.addSource('scenario-buses',{type:'geojson',data:EMPTY});
  map.addLayer({id:'scenario-route-outline',type:'line',source:'scenario-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fbfaf4','line-width':8,'line-opacity':.9}});
  map.addLayer({id:'scenario-route-line',type:'line',source:'scenario-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','colour'],'line-width':4,'line-opacity':.85}});
  map.addLayer({id:'scenario-today',type:'circle',source:'scenario-buses',filter:['==',['get','kind'],'today'],paint:{'circle-radius':['interpolate',['linear'],['zoom'],11,6,16,12],'circle-color':'rgba(88,109,101,.18)','circle-stroke-color':'#3d5249','circle-stroke-width':2.5}});
  map.addLayer({id:'scenario-new',type:'circle',source:'scenario-buses',filter:['==',['get','kind'],'scenario'],paint:{'circle-radius':['interpolate',['linear'],['zoom'],11,4.5,16,8],'circle-color':['get','colour'],'circle-stroke-color':'#fffdf5','circle-stroke-width':2}});};
 const showRoute=(journeys:RouteJourneys)=>{
  (map.getSource('scenario-route') as GeoJSONSource|undefined)?.setData({type:'Feature',geometry:{type:'MultiLineString',coordinates:journeys.shapes},properties:{colour:colour(input.routeId)}});
  const points=journeys.shapes.flat();if(!points.length)return;
  const lng=points.map(p=>p[0]),lat=points.map(p=>p[1]);
  map.fitBounds([[Math.min(...lng),Math.min(...lat)],[Math.max(...lng),Math.max(...lat)]],{padding:innerWidth>680?{top:120,left:330,right:420,bottom:120}:40,pitch:40,duration:1200});
 };
 let onMap=false,playing:ReturnType<typeof setInterval>|undefined;
 const clear=()=>{if(playing){clearInterval(playing);playing=undefined;}if(!onMap)return;onMap=false;drawn()?.setData(EMPTY);(map.getSource('scenario-route') as GeoJSONSource|undefined)?.setData(EMPTY);};
 const input:ScenarioInput={routeId:routeIds.find(id=>label(id)==='17')??routeIds[0],serviceDate:'',from:'20:00',to:'00:00',headwayMinutes:15};
 let at:number|undefined;
 const waitRow=(name:string,pick:(w:Waits)=>number,unit:(n:number)=>string,r:ScenarioResult)=>r.directions.map(d=>{const a=pick(d.today),b=pick(d.scenario);return `<tr><th>${name}<small>towards ${escape(d.headsign)}</small></th><td>${unit(a)}</td><td>${unit(b)}</td><td>${signed(Math.round((b-a)*10)/10,unit)}</td></tr>`;}).join('');
 const table=(r:ScenarioResult)=>`<table class="history-table scenario-table"><caption>${escape(label(r.input.routeId))}, ${clock.format(r.start)} to ${clock.format(r.end)} on the night of ${escape(serviceDay(r.input.serviceDate))}</caption>
  <thead><tr><th></th><th>Today<small>timetable</small></th><th>Scenario<small>every ${r.input.headwayMinutes} min</small></th><th>Change</th></tr></thead><tbody>
  ${waitRow('Buses leaving',w=>w.departures,String,r)}
  ${waitRow('Average wait',w=>w.meanWait,minutes,r)}
  ${waitRow('Longest wait',w=>w.longestWait,minutes,r)}
  <tr><th>Buses needed at once<small>including turnaround</small></th><td>${r.vehicles.today}</td><td>${r.vehicles.scenario}</td><td>${signed(r.vehicles.scenario-r.vehicles.today)}</td></tr>
  <tr><th>Buses on the road at once</th><td>${r.onRoad.today}</td><td>${r.onRoad.scenario}</td><td>${signed(r.onRoad.scenario-r.onRoad.today)}</td></tr>
  <tr><th>Hours of bus running</th><td>${r.serviceHours.today.toFixed(1)}</td><td>${r.serviceHours.scenario.toFixed(1)}</td><td>${signed(Math.round((r.serviceHours.scenario-r.serviceHours.today)*10)/10)}</td></tr>
  </tbody></table>`;
 const headline=(r:ScenarioResult)=>{
  const extra=r.vehicles.scenario-r.vehicles.today,waitsNow=r.directions.map(d=>d.today.meanWait),waitsThen=r.directions.map(d=>d.scenario.meanWait);
  const average=(list:number[])=>{const known=list.filter(Number.isFinite);return known.length?known.reduce((a,b)=>a+b,0)/known.length:NaN;},change=average(waitsThen)-average(waitsNow);
  const buses=extra>0?`${plural(extra,'more bus','more buses')} at the busiest moment`:extra<0?`${plural(-extra,'bus','buses')} fewer at the busiest moment`:'the same number of buses at the busiest moment';
  return `Running route ${escape(label(r.input.routeId))} every ${r.input.headwayMinutes} minutes from ${clock.format(r.start)} to ${clock.format(r.end)} would need ${buses}, and the average wait for someone turning up at random would ${!Number.isFinite(change)?'change from no bus at all to the new interval':Math.abs(change)<.25?'stay about the same':`${change<0?'fall':'rise'} by about ${minutes(Math.abs(change))}`} (${minutes(average(waitsNow))} today, ${minutes(average(waitsThen))} in the scenario).`;
 };
 const draw=(r:ScenarioResult,journeys:RouteJourneys,element:HTMLElement)=>{
  if(at===undefined||at<r.start||at>=r.end)at=r.start+Math.floor((r.end-r.start)/2/300_000)*300_000;
  const features=[...r.today.map(j=>({j,kind:'today'})),...r.scenario.filter(j=>j.scenario).map(j=>({j,kind:'scenario'}))].flatMap(({j,kind})=>{const p=positionAt(journeys,j,at!);return p?[{type:'Feature' as const,geometry:{type:'Point' as const,coordinates:p},properties:{kind,colour:colour(r.input.routeId)}}]:[];});
  const count=(kind:string)=>features.filter(f=>f.properties.kind===kind).length,kept=r.scenario.filter(j=>!j.scenario&&positionAt(journeys,j,at!)).length;
  if(onMap){ensureLayer();drawn()!.setData({type:'FeatureCollection',features});}
  const note=element.querySelector('#scenario-moment');
  if(note)note.innerHTML=`At <strong>${clock.format(at)}</strong>: ${plural(count('today'),'bus','buses')} on route ${escape(label(r.input.routeId))} in today’s timetable, ${plural(count('scenario')+kept,'bus','buses')} in the scenario${kept?` (${kept} still finishing journeys from before ${clock.format(r.start)})`:''}.`;
  const slider=element.querySelector<HTMLInputElement>('#scenario-time');if(slider)slider.value=String(at);
 };
 const render=async(element:HTMLElement)=>{
  const start=currentServiceDate(Date.now(),index.timezone),first=start<index.validFrom?index.validFrom:start;
  const dates=Array.from({length:14},(_,i)=>addDays(first,i)).filter(d=>d<=index.validUntil);
  if(!dates.length){element.innerHTML='<p class="schedule-notice">This timetable snapshot has expired, so there is nothing to compare a scenario with until an updated feed is published.</p>';return;}
  if(!dates.includes(input.serviceDate))input.serviceDate=dates[0];
  let data:ServiceSummary,journeys:RouteJourneys;
  try{[data,journeys]=await Promise.all([load(),journeysFor(input.routeId)]);}catch{element.innerHTML='<p>The timetable data for this scenario could not load. Open the panel again to retry.</p>';return;}
  if(!element.isConnected)return;
  const r=frequencyScenario(data,journeys,index,input);
  const controls=`<div class="explorer-controls scenario-controls"><label>Route<select id="scenario-route">${routeIds.map(id=>`<option value="${escape(id)}"${id===input.routeId?' selected':''}>${escape(label(id))}</option>`).join('')}</select></label>
   <label>Night of<select id="scenario-date">${dates.map(d=>`<option value="${d}"${d===input.serviceDate?' selected':''}>${escape(serviceDay(d))}${d===start?' (tonight)':''}</option>`).join('')}</select></label>
   <label>From<input id="scenario-from" type="time" step="300" value="${input.from}"></label><label>To<input id="scenario-to" type="time" step="300" value="${input.to}"></label>
   <label>Every (minutes)<input id="scenario-headway" type="number" min="${HEADWAY_LIMITS[0]}" max="${HEADWAY_LIMITS[1]}" step="1" value="${input.headwayMinutes}"></label></div>
   <p class="explorer-note">Times from 00:00 to 03:59 are the early hours after the chosen date. A window ending at 00:00 runs to midnight.</p>`;
  if(r.state!=='ok'){
   const why=r.state==='invalid'?`Choose a window that ends after it starts, and an interval from ${HEADWAY_LIMITS[0]} to ${HEADWAY_LIMITS[1]} minutes.`:r.state==='uncovered'?'That night is outside the timetable snapshot.':`Route ${escape(label(input.routeId))} has no journeys on or around that night, so there is no timetable to base a scenario on.`;
   element.innerHTML=`${controls}<p class="schedule-notice">${why}</p>`;bind(element);clear();return;
  }
  const now=Date.now(),liveCount=now-liveAt<LIVE_MAX_AGE_MS&&live?.some(v=>v.kind==='bus')&&now>=r.start&&now<r.end?live.filter(v=>v.kind==='bus'&&!v.cancelled&&v.label.trim().toLowerCase()===label(input.routeId).toLowerCase()).length:undefined;
  element.innerHTML=`${controls}
   <p class="explorer-summary">${headline(r)}</p>
   ${table(r)}
   <p class="explorer-note">Waits are measured at the stop most of each direction’s journeys call at: ${r.directions.map(d=>`${escape(stopNames.get(d.referenceStop)??d.referenceStop)} towards ${escape(d.headsign)}`).join('; ')}.${r.directions.some(d=>d.today.noBusFrom!==undefined)?` Today there is no later bus in one direction from ${r.directions.filter(d=>d.today.noBusFrom!==undefined).map(d=>clock.format(d.today.noBusFrom!)).join(' and ')}, so arrivals after that are left out of today’s average.`:''}</p>
   ${liveCount!==undefined?`<p class="explorer-note">Live feed right now: ${plural(liveCount,'bus','buses')} reporting route ${escape(label(input.routeId))}, against ${r.onRoad.today} timetabled at the busiest point of this window.</p>`:''}
   <h3>On the map</h3>
   <div class="scenario-map"><button type="button" class="more-departures" id="scenario-show" aria-pressed="${onMap}">${onMap?'Hide the scenario from the map':'Show both on the map'}</button>
   <label class="scenario-slider">Time<input id="scenario-time" type="range" min="${r.start}" max="${r.end-60_000}" step="60000"></label><button type="button" class="more-departures" id="scenario-play">${playing?'Pause':'Play the window'}</button>
   <p class="explorer-note" id="scenario-moment"></p><p class="scenario-legend"><span class="today">Today’s timetable</span><span class="new" style="--route:${escape(colour(input.routeId))}">Scenario</span></p></div>
   <details class="history-details" open><summary>What is measured and what is assumed</summary>
   <h3>Measured, from the timetable</h3><ul class="scenario-list"><li>Every “today” figure: departure times, gaps, running times and journeys on the road, from ${escape(index.source)} GTFS${index.version?` (dataset ${escape(index.version)})`:''}.</li><li>The running time of each new journey, copied from today’s journey on the same stops that is nearest in time. Median here: ${r.directions.map(d=>`${minutes(d.runMinutes)} towards ${escape(d.headsign)}`).join(', ')}.</li></ul>
   <h3>Assumed</h3><ul class="scenario-list">
    <li>Buses run exactly to time and evenly spaced. Delays and bunching, which the live feed shows most evenings, would make real waits longer in both columns.</li>
    <li>People arrive at random. At intervals of about 12 minutes or more many people time their arrival, so real waits are shorter than the averages shown.</li>
    <li>Each bus needs a turnaround of ${Math.round(ASSUMPTIONS.layoverShare*100)}% of its running time, and at least ${ASSUMPTIONS.layoverMinSeconds/60} minutes, before its next journey. Operators plan this differently and may share buses between routes.</li>
    <li>Every journey that passes the reference stop in the window, short workings included, is replaced by the commonest journey pattern there. Before and after the window the timetable is unchanged, so waits near the end depend on the first bus after it.</li>
    <li>Only the part of each journey inside the map is counted. Where a route runs beyond the map, it needs more buses and hours than shown.</li>
    <li>The route and stops are unchanged, and so is the number of people travelling. This does not predict ridership, cost or whether the operator could staff it.</li></ul></details>
   <small>A scenario is arithmetic on today’s timetable under the assumptions above, not a forecast. Opening it makes no provider calls.</small>`;
  bind(element);
  const slider=element.querySelector<HTMLInputElement>('#scenario-time')!;
  slider.addEventListener('input',()=>{at=+slider.value;draw(r,journeys,element);});
  element.querySelector('#scenario-show')!.addEventListener('click',()=>{onMap=!onMap;if(onMap){ensureLayer();showRoute(journeys);draw(r,journeys,element);}else clear();void render(element);});
  element.querySelector('#scenario-play')!.addEventListener('click',e=>{const b=e.currentTarget as HTMLButtonElement;
   if(playing){clearInterval(playing);playing=undefined;b.textContent='Play the window';return;}
   if(!onMap){onMap=true;ensureLayer();showRoute(journeys);const show=element.querySelector('#scenario-show')!;show.setAttribute('aria-pressed','true');show.textContent='Hide the scenario from the map';}
   b.textContent='Pause';playing=setInterval(()=>{if(!element.isConnected){clear();return;}at=at!+60_000;if(at>=r.end)at=r.start;draw(r,journeys,element);},150);});
  draw(r,journeys,element);
 };
 const bind=(element:HTMLElement)=>{
  const rerender=()=>{if(playing){clearInterval(playing);playing=undefined;}void render(element);};
  element.querySelector<HTMLSelectElement>('#scenario-route')!.addEventListener('change',e=>{input.routeId=(e.currentTarget as HTMLSelectElement).value;if(onMap)void journeysFor(input.routeId).then(showRoute,()=>{});rerender();});
  element.querySelector<HTMLSelectElement>('#scenario-date')!.addEventListener('change',e=>{input.serviceDate=(e.currentTarget as HTMLSelectElement).value;at=undefined;rerender();});
  for(const key of ['from','to'] as const)element.querySelector<HTMLInputElement>(`#scenario-${key}`)!.addEventListener('change',e=>{const value=(e.currentTarget as HTMLInputElement).value;if(/^\d\d:\d\d$/.test(value)){input[key]=value;at=undefined;rerender();}});
  element.querySelector<HTMLInputElement>('#scenario-headway')!.addEventListener('change',e=>{const value=Math.round(+(e.currentTarget as HTMLInputElement).value);if(value>=HEADWAY_LIMITS[0]&&value<=HEADWAY_LIMITS[1]){input.headwayMinutes=value;rerender();}});
 };
 const open=()=>{
  detail(`<span class="pill">Scenario · not a forecast</span><h2>What if a route ran more often?</h2><p>Pick a route, a stretch of one night and an even interval between buses. The panel sets the timetable as it is beside the same route at that interval, with the same stops and running times, and shows what would change.</p><div id="scenario-view" aria-live="polite"><p>Loading the timetable…</p></div>`);
  const element=document.querySelector<HTMLElement>('#scenario-view')!;
  // Take the scenario off the map once its panel is closed or replaced by another one.
  const details=document.querySelector<HTMLElement>('#details')!,watch=new MutationObserver(()=>{if(!element.isConnected||details.hidden){clear();watch.disconnect();}});
  watch.observe(details,{attributes:true,attributeFilter:['hidden']});watch.observe(document.querySelector('#details-content')!,{childList:true});
  void render(element);
 };
 button.addEventListener('click',open);button.disabled=false;
}
