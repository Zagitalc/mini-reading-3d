import type {Map,VectorTileSource,GeoJSONSource} from 'maplibre-gl';
import {CADENCE} from '../../shared/feed-policy';
import {BOUNDS} from '../../shared/config';
import type {Weather,FuelStation} from '../../shared/types';
import {detail,escape} from '../ui/shell';
import {WeatherEffects} from '../scene/weather';
import type {ReadingScene} from '../scene/layer';
import {fuelPumpIcon,fuelPumpLegend} from './fuel-icon';
export async function connectEnvironment(map:Map,scene:ReadingScene){
 const effects=new WeatherEffects(scene);const prior=scene.animate;scene.animate=()=>{const a=prior?.()??false;return effects.update()||a;};
 let disposed=false;const timers=new Set<ReturnType<typeof setTimeout>>();const controllers=new Set<AbortController>();
 const get=async(url:string)=>{const controller=new AbortController();controllers.add(controller);try{const r=await fetch(url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});if(!r.ok)throw Error('Feed unavailable');return await r.json();}finally{controllers.delete(controller);}};
 const tasks:{run:()=>Promise<boolean|void>;interval:number;next:number;running:boolean;failures:number}[]=[];
 const schedule=(run:()=>Promise<boolean|void>,interval:number)=>{const task={run,interval,next:0,running:false,failures:0};tasks.push(task);void invoke(task);};
 const invoke=async(task:typeof tasks[number])=>{if(disposed||task.running||document.hidden||Date.now()<task.next)return;task.running=true;try{const ok=await task.run();task.failures=ok===false?task.failures+1:0;}catch{task.failures++;}finally{task.running=false;const delay=task.failures?Math.min(task.interval,60000*2**Math.min(task.failures-1,3)):task.interval;task.next=Date.now()+delay;if(!disposed){const timer=setTimeout(()=>{timers.delete(timer);void invoke(task);},delay);timers.add(timer);}}};
 const visible=()=>{if(!document.hidden){for(const task of tasks)void invoke(task);map.triggerRepaint();}};document.addEventListener('visibilitychange',visible);
 map.on('remove',()=>{disposed=true;timers.forEach(clearTimeout);controllers.forEach(c=>c.abort());document.removeEventListener('visibilitychange',visible);effects.dispose();});
 let config:{tomtom:boolean;weather:boolean;fuel:boolean};try{config=await get('/api/v1/config');}catch{return;}if(disposed)return;
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
 const section=document.createElement('section');section.className='environment-control';section.innerHTML='<div class="layer-title">Around Reading</div><label class="layer-row"><span>☁ Weather effects</span><input id="weather-effects" type="checkbox" checked role="switch"></label><button id="weather-summary" class="environment-summary">Weather loading…</button><label class="layer-row"><span>◈ Fuel prices</span><input id="fuel-layer" type="checkbox" role="switch"></label><small id="fuel-summary">Twice-daily prices · source dates on click</small>';document.querySelector('#layers')!.append(section);
 const weatherText=section.querySelector<HTMLButtonElement>('#weather-summary')!;let weather:Weather|undefined;
 section.querySelector<HTMLInputElement>('#weather-effects')!.addEventListener('change',e=>{effects.enabled=(e.target as HTMLInputElement).checked;map.triggerRepaint();});
 weatherText.addEventListener('click',()=>{if(weather)detail(`<span class="pill">Estimated weather for Reading</span><h2>${weather.temperature.toFixed(1)}°C</h2><p>Cloud cover ${weather.cloudCover}% · Wind ${weather.windKph.toFixed(0)} km/h</p><p>Rain ${(weather.rainMm*3600/weather.intervalSeconds).toFixed(1)} mm/h equivalent over the reported interval.</p><p>Model time: ${escape(new Date(weather.observedAt).toLocaleString('en-GB'))}</p><p>Animation illustrates area-wide conditions; it does not locate individual clouds or showers.</p><a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo · CC BY 4.0</a>`);});
 if(config.weather)schedule(async()=>{try{const data=await get('/api/v1/weather');if(disposed)return;weather=data.data[0];effects.set(weather);weatherText.textContent=weather?`${weather.temperature.toFixed(0)}°C · ${weather.cloudCover}% cloud · estimated`:'Weather unavailable';return !!weather;}catch{if(!disposed){weather=undefined;effects.set();weatherText.textContent='Weather unavailable';}return false;}},CADENCE.weather);else weatherText.textContent='Weather disabled';
 let stations:FuelStation[]=[];
 map.addSource('fuel-stations',{type:'geojson',data:{type:'FeatureCollection',features:[]},attribution:'Fuel Finder via Cheap Fuel Near Me · OGL 3.0'});
 map.addImage('fuel-pump-orange',fuelPumpIcon(),{pixelRatio:2});
 map.addLayer({id:'fuel-points',type:'symbol',source:'fuel-stations',layout:{visibility:'none','icon-image':'fuel-pump-orange','icon-size':.85,'icon-anchor':'bottom','icon-allow-overlap':true,'icon-ignore-placement':true}});
 const fuelToggle=section.querySelector<HTMLInputElement>('#fuel-layer')!;fuelToggle.disabled=!config.fuel;
 fuelToggle.closest('label')!.querySelector('span')!.innerHTML=`${fuelPumpLegend}Fuel prices`;
 map.on('mouseenter','fuel-points',()=>{map.getCanvas().style.cursor='pointer';});
 map.on('mouseleave','fuel-points',()=>{map.getCanvas().style.cursor='';});
 fuelToggle.addEventListener('change',()=>{map.setLayoutProperty('fuel-points','visibility',fuelToggle.checked?'visible':'none');});
 map.on('click','fuel-points',e=>{const station=stations.find(s=>s.id===e.features?.[0]?.properties.id);if(!station)return;detail(`<span class="pill">Fuel price snapshot</span><h2>${escape(station.name)}</h2><p>${escape(station.brand)} · ${escape(station.postcode)}</p>${station.quiet?'<p>No prices submitted at this site for at least 14 days.</p>':''}<dl>${Object.entries(station.prices).map(([grade,p])=>`<dt>${escape(({E10:'Petrol E10',E5:'Petrol E5',B7S:'Diesel',B7P:'Premium diesel'} as Record<string,string>)[grade]??grade)}</dt><dd>${p.pence.toFixed(1)}p/litre<small>Submitted ${escape(new Date(p.submittedAt).toLocaleString('en-GB'))}</small></dd>`).join('')}</dl><p>Source snapshot: ${escape(new Date(station.observedAt).toLocaleString('en-GB'))}. Prices may have changed.</p>${station.locationRepaired?'<p>Source reports a corrected coordinate.</p>':''}<a href="https://cheapfuelnearme.uk/api/" target="_blank" rel="noopener">Fuel Finder via Cheap Fuel Near Me</a><p>Contains public sector information licensed under OGL v3.0.</p>`);});
 if(config.fuel)schedule(async()=>{try{const data=await get('/api/v1/fuel');if(disposed)return;stations=data.data;(map.getSource('fuel-stations') as GeoJSONSource).setData({type:'FeatureCollection',features:stations.map(s=>({type:'Feature',geometry:{type:'Point',coordinates:s.position},properties:{id:s.id}}))});section.querySelector('#fuel-summary')!.textContent=stations.length?`${stations.length} forecourts · twice-daily source`:'Fuel snapshot unavailable';return stations.length>0;}catch{if(!disposed){section.querySelector('#fuel-summary')!.textContent='Fuel snapshot unavailable';if(stations.some(s=>Date.now()-Date.parse(s.observedAt)>=48*3600000)){stations=[];(map.getSource('fuel-stations') as GeoJSONSource).setData({type:'FeatureCollection',features:[]});}}return false;}},CADENCE.fuel);
}
