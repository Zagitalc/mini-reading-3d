import type {Map,VectorTileSource,GeoJSONSource} from 'maplibre-gl';
import {CADENCE} from '../../shared/feed-policy';
import {evidenceBadge} from '../../shared/evidence';
import {BOUNDS} from '../../shared/config';
import type {Weather} from '../../shared/types';
import {detail,escape,layerGroup,toolSlot} from '../ui/shell';
import {WeatherEffects} from '../scene/weather';
import {rainRate} from '../scene/weather-layout';
const precipitationText=(w:Weather)=>w.snowCm>0?`Snow ${(w.snowCm*3600/w.intervalSeconds).toFixed(1)} cm/h equivalent over the reported interval.`:rainRate(w.rainMm,w.intervalSeconds)>0?`Rain ${rainRate(w.rainMm,w.intervalSeconds).toFixed(1)} mm/h equivalent over the reported interval.`:'No rain reported in the latest interval.';
import type {ReadingScene} from '../scene/layer';
import {fuelPumpLegend} from './fuel-icon';
import {connectFuel} from './fuel-panel';
import {connectRivers} from './river-layers';
import {publishFact} from '../ui/summary';
import {fuelFact} from '../../shared/summary';
export async function connectEnvironment(map:Map,scene:ReadingScene){
 const effects=new WeatherEffects(scene);const prior=scene.animate;scene.animate=()=>{const a=prior?.()??false;return effects.update()||a;};
 let disposed=false;const timers=new Set<ReturnType<typeof setTimeout>>();const controllers=new Set<AbortController>();
 const get=async(url:string)=>{const controller=new AbortController();controllers.add(controller);try{const r=await fetch(url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});if(!r.ok)throw Error('Feed unavailable');return await r.json();}finally{controllers.delete(controller);}};
 const tasks:{run:()=>Promise<boolean|void>;interval:number;next:number;running:boolean;failures:number}[]=[];
 const schedule=(run:()=>Promise<boolean|void>,interval:number)=>{const task={run,interval,next:0,running:false,failures:0};tasks.push(task);void invoke(task);};
 const invoke=async(task:typeof tasks[number])=>{if(disposed||task.running||document.hidden||Date.now()<task.next)return;task.running=true;try{const ok=await task.run();task.failures=ok===false?task.failures+1:0;}catch{task.failures++;}finally{task.running=false;const delay=task.failures?Math.min(task.interval,60000*2**Math.min(task.failures-1,3)):task.interval;task.next=Date.now()+delay;if(!disposed){const timer=setTimeout(()=>{timers.delete(timer);void invoke(task);},delay);timers.add(timer);}}};
 const visible=()=>{if(!document.hidden){for(const task of tasks)void invoke(task);map.triggerRepaint();}};document.addEventListener('visibilitychange',visible);
 // Offline, the last weather must not keep raining as if current; back online, every feed is asked again at once rather than at its next interval.
 let dropWeather=()=>{};const offline=()=>dropWeather();const online=()=>{for(const task of tasks)task.next=0;visible();};window.addEventListener('offline',offline);window.addEventListener('online',online);
 map.on('remove',()=>{disposed=true;timers.forEach(clearTimeout);controllers.forEach(c=>c.abort());document.removeEventListener('visibilitychange',visible);window.removeEventListener('offline',offline);window.removeEventListener('online',online);effects.dispose();});
 let config:{tomtom:boolean;weather:boolean;fuel:boolean;rivers?:boolean};try{config=await get('/api/v1/config');}catch{return;}if(disposed)return;
 if(config.tomtom){
  const tileUrl=()=>`${location.origin}/api/v1/traffic-tiles/{z}/{x}/{y}?v=${Math.floor(Date.now()/CADENCE.traffic)}`;
  const toggle=document.querySelector<HTMLInputElement>('[data-layer=traffic]')!;
  let loaded=false;
  const show=()=>{if(toggle.checked&&!loaded){map.addSource('tomtom-flow',{type:'vector',tiles:[tileUrl()],minzoom:10,maxzoom:14,bounds:BOUNDS,attribution:'© TomTom Traffic'});map.addLayer({id:'tomtom-flow-lines',type:'line',source:'tomtom-flow','source-layer':'Traffic flow',filter:['has','relative_speed'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['case',['==',['get','road_closure'],true],'#644950',['step',['get','relative_speed'],'#c54941',.4,'#df9b36',.75,'#60a26c']],'line-width':['interpolate',['linear'],['zoom'],10,1.5,14,3,18,7],'line-opacity':.8}},'road-event-lines');loaded=true;}if(loaded)map.setLayoutProperty('tomtom-flow-lines','visibility',toggle.checked?'visible':'none');};
  toggle.addEventListener('change',show);show();
  const label=document.querySelector('#traffic-availability')!;label.textContent='loading';
  map.on('sourcedata',e=>{if(e.sourceId==='tomtom-flow'&&e.isSourceLoaded)label.textContent='TomTom · 5 min cache';});
  map.on('error',e=>{if((e as {sourceId?:string}).sourceId==='tomtom-flow')label.textContent='unavailable / quota';});
  let firstTrafficRefresh=true;
  schedule(async()=>{if(firstTrafficRefresh){firstTrafficRefresh=false;return;}if(loaded&&toggle.checked)(map.getSource('tomtom-flow') as VectorTileSource).setTiles([tileUrl()]);},CADENCE.traffic);
 }
 const section=document.createElement('section');section.className='environment-control';section.innerHTML='<label class="layer-row"><span><i>☁</i>Weather effects</span><input id="weather-effects" type="checkbox" checked role="switch"></label><button id="weather-summary" class="environment-summary">Weather loading…</button><label class="layer-row"><span>◈ Fuel prices</span><input id="fuel-layer" type="checkbox" role="switch"></label><small id="fuel-summary">Twice-daily prices · source dates on click</small>';layerGroup('around').append(section);toolSlot('fuel').innerHTML='<button id="fuel-compare" type="button" class="layer-row"><span><i>◈</i>Fuel prices and trips<small>Compare</small></span><span aria-hidden="true">↗</span></button>';
 const weatherText=section.querySelector<HTMLButtonElement>('#weather-summary')!;let weather:Weather|undefined;
 section.querySelector<HTMLInputElement>('#weather-effects')!.addEventListener('change',e=>{effects.enabled=(e.target as HTMLInputElement).checked;map.triggerRepaint();});
 weatherText.addEventListener('click',()=>{if(weather)detail(`<span class="pill">Estimated weather for Reading</span>${evidenceBadge('estimated')}<h2>${weather.temperature.toFixed(1)}°C</h2><p>Cloud cover ${weather.cloudCover}% · Wind ${weather.windKph.toFixed(0)} km/h</p><p>${precipitationText(weather)}</p><p>Model time: ${escape(new Date(weather.observedAt).toLocaleString('en-GB'))}</p><p>The number of clouds follows the reported cover, and rain or snow is drawn only while the model reports it falling. Cloud positions are illustrative: the model gives one value for the whole area, so it does not locate individual clouds or showers.</p><a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo · CC BY 4.0</a>`);});
 if(config.weather)schedule(async()=>{try{const data=await get('/api/v1/weather');if(disposed)return;weather=data.data[0];effects.set(weather);publishFact('weather',weather?{temperature:weather.temperature,cloudCover:weather.cloudCover,precipitation:weather.snowCm>0?'snow':rainRate(weather.rainMm,weather.intervalSeconds)>0?'rain':'none',at:Date.parse(weather.observedAt)||Date.now()}:undefined);weatherText.textContent=weather?`${weather.temperature.toFixed(0)}°C · ${weather.cloudCover}% cloud${weather.snowCm>0?' · snow':rainRate(weather.rainMm,weather.intervalSeconds)>0?' · rain':''} · estimated`:'Weather unavailable';return !!weather;}catch{if(!disposed){weather=undefined;effects.set();publishFact('weather',undefined);weatherText.textContent='Weather unavailable';}return false;}},CADENCE.weather);else weatherText.textContent='Weather disabled';
 if(config.weather){dropWeather=()=>{if(disposed)return;weather=undefined;effects.set();publishFact('weather',undefined);weatherText.textContent='Weather unavailable offline';};if(!navigator.onLine)dropWeather();}
 const fuel=connectFuel(map,section,config.fuel);
 const fuelToggle=section.querySelector<HTMLInputElement>('#fuel-layer')!;
 fuelToggle.closest('label')!.querySelector('span')!.innerHTML=`${fuelPumpLegend}Fuel prices`;
 const fuelSummary=section.querySelector('#fuel-summary')!;
 if(config.fuel)schedule(async()=>{try{const data=await get('/api/v1/fuel');if(disposed)return;fuel.set(data.data);const list=fuel.stations;publishFact('fuel',fuelFact(list,Date.now()));const latest=list.map(s=>s.observedAt).sort().at(-1);
  fuelSummary.textContent=latest?`${list.length} forecourts · prices as of ${new Date(latest).toLocaleString('en-GB',{timeZone:'Europe/London',weekday:'short',hour:'2-digit',minute:'2-digit'})}`:'Fuel snapshot unavailable';return list.length>0;}
  catch{if(!disposed){fuelSummary.textContent='Fuel snapshot unavailable';if(fuel.stations.some(s=>Date.now()-Date.parse(s.observedAt)>=48*3600000)){fuel.set([]);publishFact('fuel',undefined);}}return false;}},CADENCE.fuel);
 connectRivers(map,section,schedule,get,config.rivers===true,CADENCE.rivers,()=>disposed);
}
