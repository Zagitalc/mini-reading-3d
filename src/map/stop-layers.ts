import type {Map} from 'maplibre-gl';
import {detail,escape,layerGroup,sourceFooter} from '../ui/shell';
import {countdown,delayLabel,liveDepartures,liveKey,LIVE_MAX_AGE_MS,type LiveStatus,type RouteJourneys} from '../../shared/live-departures';
import type {VehicleObservation} from '../../shared/types';
import {needVehicles,subscribeVehicles} from './vehicle-feed';
import {registerSwitch} from '../ui/modes';
import {addDays,compareRouteLabels,currentServiceDate,lastDepartures,localDate,scheduledDepartures,timetableExpired,timetableStatus,tonightDepartures,type BusStop,type StopIndex,type StopTimetable} from '../../shared/timetable';
const dateLabel=(date:string)=>`${date.slice(6,8)}/${date.slice(4,6)}/${date.slice(0,4)}`;
export async function connectStopLayers(map:Map){
 const section=document.createElement('section');section.className='route-control stop-control';
 section.innerHTML='<label class="layer-row"><span><i>○</i>Bus stops</span><input type="checkbox" id="bus-stops-toggle" role="switch" checked disabled></label><details><summary>Find a stop</summary><label class="stop-search">Stop name or code<input type="search" aria-label="Find a bus stop" placeholder="Station, Oxford Road…"></label><div class="stop-results" aria-live="polite"></div></details><small class="stop-loading">Loading stop snapshot…</small><small class="timetable-status" role="status"></small>';
 layerGroup('move').append(section);
 let disposed=false,timer:ReturnType<typeof setInterval>|undefined,active:{element:HTMLElement;stop:BusStop;data?:StopTimetable}|undefined;
 map.on('remove',()=>{disposed=true;clearInterval(timer);});
 let view:'next'|'tonight'|'last'='next',visibleCount=30,lastDate:string|undefined;
 const cache=new globalThis.Map<string,Promise<StopTimetable>>(),journeyCache=new globalThis.Map<string,Promise<RouteJourneys>>();
 // Live positions arrive from the vehicle layer's own refresh; undefined until the first one, null when it failed.
 let vehicles:VehicleObservation[]|null|undefined,vehiclesAt=0;
 // With the bus layer off (outside Transport mode), an open board in the next-departures view asks for positions itself.
 let releaseLive:(()=>void)|undefined;
 const liveDemand=()=>{const want=!disposed&&view==='next'&&!!active?.element.isConnected&&!document.querySelector<HTMLElement>('#details')!.hidden;
  if(want&&!releaseLive)releaseLive=needVehicles();else if(!want&&releaseLive){releaseLive();releaseLive=undefined;}};
 let journeys:{stopId:string;routes:globalThis.Map<string,RouteJourneys>;state:'loading'|'ready'|'missing'|'failed'}|undefined;
 const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});
 const day=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short'});
 try{
  const response=await fetch('/data/bus-stops.json',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Stop snapshot unavailable');const index:StopIndex=await response.json();if(disposed)return;
  const byId=new globalThis.Map(index.stops.map(s=>[s.id,s]));
  const freshness=()=>{const status=timetableStatus(index),el=section.querySelector<HTMLElement>('.timetable-status')!;
   el.classList.toggle('schedule-notice',status.state!=='current');
   const through=dateLabel(index.validUntil);
   el.textContent=status.state==='expired'?`Timetable expired ${through} · awaiting an updated feed`:status.state==='future'?`Timetable begins ${dateLabel(index.validFrom)}`:`Timetable through ${through}${status.state==='expiring'?` · expires ${status.days===0?'today':`in ${status.days} days`}`:''}`;
  };
  const serviceDay=(date:string)=>day.format(Date.UTC(+date.slice(0,4),+date.slice(4,6)-1,+date.slice(6,8),12));
  const renderLast=(data:StopTimetable,element:HTMLElement,now:number)=>{
   const start=currentServiceDate(now,index.timezone),dates=[0,1,2,3,4,5,6].map(i=>addDays(start<index.validFrom?index.validFrom:start,i)).filter(d=>d<=index.validUntil);
   if(!dates.length){element.innerHTML='<p class="schedule-notice">This timetable snapshot has expired. Last departures are unavailable until an updated feed is published.</p>';return;}
   if(!lastDate||!dates.includes(lastDate))lastDate=dates[0];
   const result=lastDepartures(data,index,lastDate),label=(id:string)=>index.routes[id]?.label??id;
   const groups=result.groups.sort((a,b)=>compareRouteLabels(label(a.routeId),label(b.routeId))||a.direction.localeCompare(b.direction)||a.last.time-b.last.time);
   const ambiguous=new Set(groups.map(g=>`${g.routeId}|${g.headsign}`).filter((k,i,all)=>all.indexOf(k)!==i));
   const picker=`<label class="service-date-picker">Service date<select>${dates.map(d=>`<option value="${d}"${d===lastDate?' selected':''}>${escape(serviceDay(d))}${d===start?' (tonight)':''}</option>`).join('')}</select></label>`;
   const rows=groups.map(g=>{const departed=g.last.time<now,next=g.next;
    return `<li class="last-departure${departed?' departed':''}"><time datetime="${new Date(g.last.time).toISOString()}">${clock.format(g.last.time)}<small>${escape(day.format(g.last.time))}${g.afterMidnight?' · after midnight':''}</small></time><div><strong>${escape(label(g.routeId))}</strong> ${escape(g.headsign)}${ambiguous.has(`${g.routeId}|${g.headsign}`)?` <small>Timetable direction ${escape(g.direction||'not supplied')}</small>`:''}<small>${departed?'Already departed · ':''}Last of ${g.count} ${g.count===1?'departure':'departures'} · ${g.last.approximate?'approximate timetable time':'scheduled'}</small><small>${next?`Next: ${clock.format(next.time)} ${escape(day.format(next.time))} (service date ${dateLabel(next.serviceDate)})${next.time-g.last.time<90*60000?'. Service continues through the night; this is where one service date hands over to the next, not a last bus.':''}`:result.nextCovered?'No departures to this destination on the following service date.':'Following service date is outside this timetable snapshot.'}</small></div></li>`;}).join('');
   element.innerHTML=`${picker}<p class="departure-window">Final scheduled boarding departure for each route, direction and destination on service date ${dateLabel(lastDate)}, computed from the whole timetable. Times after midnight still belong to this service date. Scheduled times, not live predictions: cancellations and delays are not included.</p>${groups.length?`<ol class="departures last-departures">${rows}</ol><small>A short working to a different destination is listed separately. Source: ${escape(index.source)} GTFS${index.version?`, dataset ${escape(index.version)}`:''}.</small>`:'<p>No scheduled boarding departures on this service date in this snapshot.</p>'}`;
   element.querySelector('select')!.addEventListener('change',e=>{lastDate=(e.currentTarget as HTMLSelectElement).value;render();});
  };
  const loadJourneys=(stop:BusStop)=>{
   const urls=stop.routeIds.flatMap(id=>index.routes[id]?.journeysUrl?[[id,index.routes[id].journeysUrl!] as const]:[]);
   const state:NonNullable<typeof journeys>={stopId:stop.id,routes:new globalThis.Map<string,RouteJourneys>(),state:urls.length?'loading':'missing'};journeys=state;if(!urls.length)return;
   Promise.all(urls.map(async([id,url])=>{
    if(!journeyCache.has(url)){const promise=fetch(url,{signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw Error('Missing journeys');const data:RouteJourneys=await r.json();if(data.schema!==1||data.routeId!==id)throw Error('Invalid journeys');return data;}).catch(error=>{journeyCache.delete(url);throw error;});journeyCache.set(url,promise);if(journeyCache.size>24)journeyCache.delete(journeyCache.keys().next().value!);}
    state.routes.set(id,await journeyCache.get(url)!);
   })).then(()=>{if(journeys===state){state.state='ready';render();}},()=>{if(journeys===state){state.state='failed';render();}});
  };
  const liveSection=(data:StopTimetable,now:number)=>{
   const heading='<h3>Live estimates</h3>',notice=(text:string)=>`<section class="live-departures">${heading}<p class="live-empty">${text}</p></section>`;
   if(!journeys||journeys.stopId!==data.stopId||journeys.state==='missing')return {html:notice('Live estimates need journey data that arrives with the next timetable refresh. The times below are scheduled only.'),statuses:new globalThis.Map<string,LiveStatus>()};
   if(journeys.state==='loading')return {html:notice('Loading journey data for live estimates…'),statuses:new globalThis.Map<string,LiveStatus>()};
   if(journeys.state==='failed')return {html:notice('Journey data for live estimates could not load. The times below are scheduled only.'),statuses:new globalThis.Map<string,LiveStatus>()};
   if(vehicles===undefined)return {html:notice('Waiting for live bus positions…'),statuses:new globalThis.Map<string,LiveStatus>()};
   if(vehicles===null||now-vehiclesAt>LIVE_MAX_AGE_MS)return {html:notice('Live bus positions are unavailable right now, so only scheduled times are shown.'),statuses:new globalThis.Map<string,LiveStatus>()};
   if(!vehicles.some(v=>v.kind==='bus'))return {html:notice('No live bus positions are coming through from the Bus Open Data Service right now. The times below are scheduled only.'),statuses:new globalThis.Map<string,LiveStatus>()};
   // A late bus can still be on its way after its scheduled time, so look back half an hour.
   const candidates=scheduledDepartures(data,now-30*60000,2,Infinity).filter(d=>d.time<=now+90*60000);
   const statuses=liveDepartures(candidates,vehicles,journeys.routes,id=>index.routes[id]?.label??id,now);
   const estimates=candidates.flatMap(d=>{const s=statuses.get(liveKey(d));return s?.state==='estimate'&&!s.estimate.passed&&s.estimate.expected>=now-60000?[{d,e:s.estimate}]:[];}).sort((a,b)=>a.e.expected-b.e.expected);
   const upcoming=candidates.filter(d=>d.time>=now&&d.time<=now+60*60000),covered=upcoming.filter(d=>statuses.get(liveKey(d))?.state==='estimate').length;
   const age=(at:string)=>{const seconds=Math.max(0,Math.round((now-Date.parse(at))/1000));return seconds<10?'Bus position just reported':`Bus position ${seconds<60?`${seconds} s`:`${Math.round(seconds/60)} min`} old`;};
   const rows=estimates.map(({d,e})=>`<li><span class="countdown">${countdown(e.expected,now)}</span><div><strong>${escape(index.routes[d.routeId]?.label??d.routeId)}</strong> ${escape(d.headsign)}<small>Estimated ${clock.format(e.expected)} · ${delayLabel(e.delaySeconds)} (scheduled ${clock.format(e.scheduled)})</small><small>${age(e.observedAt)}</small></div></li>`).join('');
   const summary=upcoming.length?`Live estimates cover ${covered} of the ${upcoming.length} scheduled ${upcoming.length===1?'departure':'departures'} in the next hour. The others have no tracked bus running that journey yet, usually because it has not started.`:'No scheduled departures in the next hour.';
   return {statuses,html:`<section class="live-departures">${heading}${rows?`<ol class="departures live">${rows}</ol>`:'<p class="live-empty">No tracked bus is running any of this stop’s next departures at the moment. The times below are scheduled only.</p>'}<small>${summary} Each estimate is the scheduled time shifted by how late or early the bus is running now, judged from its GPS position against its own timetable. It is not an operator prediction and assumes the delay holds.</small></section>`};
  };
  const render=()=>{freshness();liveDemand();
   if(disposed||document.hidden||!active?.element.isConnected||document.querySelector<HTMLElement>('#details')!.hidden||!active.data)return;
   // Periodic refreshes must not close a service-date menu the viewer is using.
   if(view==='last'){if(document.activeElement?.tagName!=='SELECT'||!active.element.contains(document.activeElement))renderLast(active.data,active.element,Date.now());return;}
   const {data,element}=active,now=Date.now(),night=view==='tonight'?tonightDepartures(data,index,now):undefined;
   const expired=timetableExpired(index,now),before=localDate(now,index.timezone)<index.validFrom;
   const departures=night?.departures??(expired||before?[]:scheduledDepartures(data,now));
   const today=localDate(now,index.timezone),cutoff=night?`${clock.format(night.end)} ${day.format(night.end)}`:'';
   const notice=expired?'This timetable snapshot has expired. Current scheduled departures are unavailable.':before?'This snapshot has not started yet. Current scheduled departures are unavailable.':night?.state==='partial'?'Timetable coverage ends during this window. Only departures from covered service dates are shown; the list may be incomplete.':'';
   const windowLabel=night?`From ${clock.format(now)} ${day.format(now)} until ${cutoff} · London time.`:'Next 24 hours · London time.';
   const empty=expired||before?'Current scheduled departures are unavailable from this snapshot.':night?.state==='partial'?'No departures found in the covered part of this window. The timetable cannot confirm the rest.':night?'No scheduled departures in this window in this snapshot.':'No scheduled departures in the next 24 hours in this snapshot.';
   const shown=night?departures.slice(0,visibleCount):departures;
   const live=!night&&!expired&&!before?liveSection(data,now):undefined;
   const flag=(d:typeof departures[number])=>{const s=live?.statuses.get(liveKey(d));if(s?.state!=='estimate')return '';return s.estimate.passed?'<small class="live-flag">Live: this bus has already passed the stop</small>':`<small class="live-flag">Live estimate ${clock.format(s.estimate.expected)} · ${delayLabel(s.estimate.delaySeconds)}</small>`;};
   element.innerHTML=`${notice?`<p class="schedule-notice">${notice}</p>`:''}${live?.html??''}<h3 class="scheduled-heading">${night?'Scheduled departures':'Scheduled timetable'}</h3><p class="departure-window">${windowLabel} Scheduled times, not live predictions.</p>${night?'<p class="night-explanation">The 04:00 cutoff is a viewing window, not the last bus. Services may continue later.</p>':''}${night?.afterMidnightRouteIds.length?`<p class="after-midnight-routes">Departures after midnight in this window: ${night.afterMidnightRouteIds.map(id=>escape(index.routes[id]?.label??id)).join(', ')}.</p>`:''}${departures.length?`<p class="departure-count">${night?`Showing ${shown.length} of ${departures.length} departures in this window.`:`Next ${shown.length} departures.`}</p><ol class="departures">`+shown.map(d=>`<li><time datetime="${new Date(d.time).toISOString()}">${clock.format(d.time)}<small>${localDate(d.time,index.timezone)!==today?'Tomorrow · ':''}${day.format(d.time)}</small></time><div><strong>${escape(index.routes[d.routeId]?.label??d.routeId)}</strong> ${escape(d.headsign)}<small>${d.approximate?'Approximate timetable time':'Scheduled'}${d.pickupType===2?' · Arrange pickup by phone':d.pickupType===3?' · Arrange pickup with driver':''}</small><small>Service date ${dateLabel(d.serviceDate)}</small>${flag(d)}</div></li>`).join('')+'</ol>':`<p>${empty}</p>`}${shown.length<departures.length?'<button class="more-departures" type="button">Show more departures</button>':''}`;
   element.querySelector('.more-departures')?.addEventListener('click',()=>{const firstNew=shown.length;visibleCount+=30;render();const row=element.querySelectorAll<HTMLElement>('.departures li')[firstNew];if(row){row.tabIndex=-1;row.focus();}});
  };
  const open=async(stop:BusStop)=>{
   detail(`<span class="pill">Bus stop · timetable</span><h2>${escape(stop.name)}</h2><p>Stop ${escape(stop.code)}</p><h3>Routes in this snapshot</h3><p>${stop.routeIds.map(id=>`<span class="stop-route">${escape(index.routes[id]?.label??id)}</span>`).join(' ')}</p><small>Routes recorded at this stop, including drop-off-only services. Service varies by date.</small><h3>Departures</h3><div class="departure-views" role="group" aria-label="Departure time window"><button type="button" data-departure-view="next" aria-pressed="${view==='next'}">Next departures</button><button type="button" data-departure-view="tonight" aria-pressed="${view==='tonight'}">Tonight / overnight</button><button type="button" data-departure-view="last" aria-pressed="${view==='last'}">Last departures</button></div><div id="stop-departures" aria-live="polite"><p>Loading this stop’s timetable…</p></div><p class="explorer-note">The timetable does not show cancellations. Live estimates come from bus GPS positions published on the Bus Open Data Service and cover only journeys already under way. Terminal and drop-off-only calls are excluded. Untimed and frequency-based services are not listed.</p>${sourceFooter([['Source',`<a href="${escape(index.sourceUrl)}" target="_blank" rel="noopener">${escape(index.source)} GTFS</a> · ${escape(index.licence)}`],['Snapshot retrieved',escape(new Date(index.retrievedAt).toLocaleDateString('en-GB',{timeZone:index.timezone}))],['Service dates in dataset',`${dateLabel(index.validFrom)}–${dateLabel(index.validUntil)}`]])}`);
   const element=document.querySelector<HTMLElement>('#stop-departures')!;active={element,stop};loadJourneys(stop);visibleCount=30;lastDate=undefined;
   document.querySelectorAll<HTMLButtonElement>('[data-departure-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.departureView as typeof view;visibleCount=30;document.querySelectorAll<HTMLButtonElement>('[data-departure-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
   if(!stop.timetableUrl){element.textContent='No timed departures supplied for this stop.';return;}
   try{
    const url=stop.timetableUrl;
    if(!cache.has(url)){const promise=fetch(url,{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)throw Error('Missing timetable');const data:StopTimetable=await r.json();if(data.stopId!==stop.id||data.schema!==1)throw Error('Invalid timetable');return data;}).catch(error=>{cache.delete(url);throw error;});cache.set(url,promise);if(cache.size>32)cache.delete(cache.keys().next().value!);}
    const data=await cache.get(url)!;if(disposed||active?.element!==element||!element.isConnected)return;active.data=data;render();
   }catch{if(element.isConnected)element.textContent='This stop’s timetable could not load. Select the stop again to retry.';}
  };
  map.addSource('bus-stops',{type:'geojson',data:{type:'FeatureCollection',features:index.stops.map(s=>({type:'Feature',geometry:{type:'Point',coordinates:s.position},properties:{id:s.id,name:s.name}}))}});
  map.addLayer({id:'bus-stop-dots',source:'bus-stops',type:'circle',minzoom:15,paint:{'circle-radius':['interpolate',['linear'],['zoom'],15,3,18,6],'circle-color':'#fffdf5','circle-stroke-color':'#416f85','circle-stroke-width':2}});
  map.addLayer({id:'bus-stop-labels',source:'bus-stops',type:'symbol',minzoom:17,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':10,'text-offset':[0,1.2],'text-anchor':'top'},paint:{'text-color':'#345d6c','text-halo-color':'#fffdf7','text-halo-width':2}});
  const toggle=section.querySelector<HTMLInputElement>('#bus-stops-toggle')!;toggle.disabled=false;toggle.addEventListener('change',()=>{for(const id of ['bus-stop-dots','bus-stop-labels'])map.setLayoutProperty(id,'visibility',toggle.checked?'visible':'none');});registerSwitch('stops',toggle);
  map.on('click','bus-stop-dots',e=>{const stop=byId.get(e.features?.[0]?.properties.id);if(stop)void open(stop);});
  map.on('mouseenter','bus-stop-dots',()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave','bus-stop-dots',()=>map.getCanvas().style.cursor='');
  const search=section.querySelector<HTMLInputElement>('input[type=search]')!,results=section.querySelector<HTMLElement>('.stop-results')!;
  search.addEventListener('input',()=>{results.replaceChildren();const q=search.value.trim().toLowerCase();if(q.length<2)return;const matches=index.stops.filter(s=>`${s.name} ${s.code} ${s.id}`.toLowerCase().includes(q)).slice(0,12);if(!matches.length)results.textContent='No matching stops in this snapshot.';for(const stop of matches){const button=document.createElement('button');button.textContent=`${stop.name} · ${stop.code}`;button.addEventListener('click',()=>{toggle.checked=true;toggle.dispatchEvent(new Event('change'));map.flyTo({center:stop.position,zoom:17,pitch:45});void open(stop);});results.append(button);}});
  section.querySelector('.stop-loading')!.textContent=`${index.stops.length.toLocaleString()} stops · visible when zoomed in`;
  const unsubscribe=subscribeVehicles(update=>{vehicles=update.vehicles;vehiclesAt=update.at;if(view==='next')render();});map.on('remove',unsubscribe);
  freshness();timer=setInterval(render,60_000);document.addEventListener('visibilitychange',render);map.on('remove',()=>document.removeEventListener('visibilitychange',render));
 }catch{section.querySelector('.stop-loading')!.textContent='Stop snapshot unavailable';}
 map.on('remove',()=>{disposed=true;clearInterval(timer);cache.clear();releaseLive?.();});
}
