import type {Map} from 'maplibre-gl';
import {detail,escape} from '../ui/shell';
import {localDate,scheduledDepartures,timetableExpired,type BusStop,type StopIndex,type StopTimetable} from '../../shared/timetable';
const dateLabel=(date:string)=>`${date.slice(6,8)}/${date.slice(4,6)}/${date.slice(0,4)}`;
export async function connectStopLayers(map:Map){
 const section=document.createElement('section');section.className='route-control stop-control';
 section.innerHTML='<label class="layer-row"><span><i>○</i>Bus stops</span><input type="checkbox" id="bus-stops-toggle" role="switch" checked disabled></label><details><summary>Find a stop</summary><label class="stop-search">Stop name or code<input type="search" aria-label="Find a bus stop" placeholder="Station, Oxford Road…"></label><div class="stop-results" aria-live="polite"></div></details><small class="stop-loading">Loading stop snapshot…</small>';
 document.querySelector('#layers')!.insertBefore(section,document.querySelector('[data-layer=traffic]')!.closest('label'));
 let disposed=false,timer:ReturnType<typeof setInterval>|undefined,active:{element:HTMLElement;stop:BusStop;data?:StopTimetable}|undefined;
 map.on('remove',()=>{disposed=true;clearInterval(timer);});
 const cache=new globalThis.Map<string,Promise<StopTimetable>>();
 const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});
 const day=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short'});
 try{
  const response=await fetch('/data/bus-stops.json',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Stop snapshot unavailable');const index:StopIndex=await response.json();if(disposed)return;
  const byId=new globalThis.Map(index.stops.map(s=>[s.id,s]));
  const render=()=>{
   if(disposed||document.hidden||!active?.element.isConnected||document.querySelector<HTMLElement>('#details')!.hidden||!active.data)return;
   const {data,element}=active,now=Date.now(),departures=scheduledDepartures(data,now),expired=timetableExpired(index,now),before=localDate(now,index.timezone)<index.validFrom;
   element.innerHTML=`${expired?'<p class="schedule-notice">This timetable snapshot has expired. Only any remaining overnight services are shown; refresh the dataset for current schedules.</p>':before?'<p class="schedule-notice">This snapshot has not started yet.</p>':''}<p>Next 24 hours · London time. Scheduled times, not live predictions.</p>${departures.length?'<ol class="departures">'+departures.map(d=>`<li><time datetime="${new Date(d.time).toISOString()}">${clock.format(d.time)}<small>${day.format(d.time)}</small></time><div><strong>${escape(index.routes[d.routeId]?.label??d.routeId)}</strong> ${escape(d.headsign)}<small>${d.approximate?'Approximate timetable time':'Scheduled'}${d.pickupType===2?' · Arrange pickup by phone':d.pickupType===3?' · Arrange pickup with driver':''}</small></div></li>`).join('')+'</ol>':`<p>${expired?'No current departures available from this snapshot.':before?'No departures in the next 24 hours from this future snapshot.':'No scheduled departures in the next 24 hours in this snapshot.'}</p>`}`;
  };
  const open=async(stop:BusStop)=>{
   detail(`<span class="pill">Bus stop · timetable</span><h2>${escape(stop.name)}</h2><p>Stop ${escape(stop.code)}</p><h3>Routes in this snapshot</h3><p>${stop.routeIds.map(id=>`<span class="stop-route">${escape(index.routes[id]?.label??id)}</span>`).join(' ')}</p><small>Routes recorded at this stop, including drop-off-only services. Service varies by date.</small><h3>Scheduled departures</h3><div id="stop-departures" aria-live="polite"><p>Loading this stop’s timetable…</p></div><dl><dt>Source</dt><dd><a href="${escape(index.sourceUrl)}" target="_blank" rel="noopener">${escape(index.source)} GTFS</a> · ${escape(index.licence)}</dd><dt>Snapshot retrieved</dt><dd>${escape(new Date(index.retrievedAt).toLocaleDateString('en-GB',{timeZone:index.timezone}))}</dd><dt>Service dates in dataset</dt><dd>${dateLabel(index.validFrom)}–${dateLabel(index.validUntil)}</dd></dl><small>Cancelled trips and delays are not available in this static timetable. Terminal and drop-off-only calls are excluded. Untimed and frequency-based services are not listed.</small>`);
   const element=document.querySelector<HTMLElement>('#stop-departures')!;active={element,stop};
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
  const toggle=section.querySelector<HTMLInputElement>('#bus-stops-toggle')!;toggle.disabled=false;toggle.addEventListener('change',()=>{for(const id of ['bus-stop-dots','bus-stop-labels'])map.setLayoutProperty(id,'visibility',toggle.checked?'visible':'none');});
  map.on('click','bus-stop-dots',e=>{const stop=byId.get(e.features?.[0]?.properties.id);if(stop)void open(stop);});
  map.on('mouseenter','bus-stop-dots',()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave','bus-stop-dots',()=>map.getCanvas().style.cursor='');
  const search=section.querySelector<HTMLInputElement>('input[type=search]')!,results=section.querySelector<HTMLElement>('.stop-results')!;
  search.addEventListener('input',()=>{results.replaceChildren();const q=search.value.trim().toLowerCase();if(q.length<2)return;const matches=index.stops.filter(s=>`${s.name} ${s.code} ${s.id}`.toLowerCase().includes(q)).slice(0,12);if(!matches.length)results.textContent='No matching stops in this snapshot.';for(const stop of matches){const button=document.createElement('button');button.textContent=`${stop.name} · ${stop.code}`;button.addEventListener('click',()=>{toggle.checked=true;toggle.dispatchEvent(new Event('change'));map.flyTo({center:stop.position,zoom:17,pitch:45});void open(stop);});results.append(button);}});
  section.querySelector('.stop-loading')!.textContent=`${index.stops.length.toLocaleString()} stops · visible when zoomed in`;
  timer=setInterval(render,60_000);document.addEventListener('visibilitychange',render);map.on('remove',()=>document.removeEventListener('visibilitychange',render));
 }catch{section.querySelector('.stop-loading')!.textContent='Stop snapshot unavailable';}
 map.on('remove',()=>{disposed=true;clearInterval(timer);cache.clear();});
}
