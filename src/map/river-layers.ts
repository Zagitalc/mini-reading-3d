import type {Map,GeoJSONSource,MapLayerMouseEvent} from 'maplibre-gl';
import type {FloodWarning,RiverFeedItem,RiverGauge,RiverLevel} from '../../shared/types';
import {detail,escape} from '../ui/shell';
import {registerSwitch} from '../ui/modes';
import {MAX_HITS,registerSearch} from '../ui/search';
import {publishFact} from '../ui/summary';
import {rank} from '../../shared/search';
import {GAUGE_COLOUR,gaugeIcon} from './river-icon';
// Measured levels and official warning areas only: nothing here estimates where water would spread.
export const SEVERITY_COLOUR={1:'#a3261e',2:'#dd6a2a',3:'#e2b23a'} as const;
const OLD_READING=2*3_600_000;
const time=(iso:string)=>new Date(iso).toLocaleString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'});
const unitNote=(unit:string)=>unit==='mASD'?'metres above the gauge’s local datum':unit==='mAOD'?'metres above Ordnance Datum (sea level)':unit;
/** The level used for the map colour: the main stage reading, not a lock's downstream gauge. */
export function mainLevel(g:RiverGauge):RiverLevel|undefined {return g.levels.find(l=>/^stage$/i.test(l.qualifier))??g.levels.find(l=>!/downstream/i.test(l.qualifier))??g.levels[0];}
/** Compared with the EA's published typical range; only for the local-datum stage the range describes. */
export function rangeState(g:RiverGauge):'high'|'normal'|'low'|'unknown' {
 const l=mainLevel(g);if(!l||l.unit!=='mASD'||g.typicalHigh===undefined||g.typicalLow===undefined)return 'unknown';
 return l.value>g.typicalHigh?'high':l.value<g.typicalLow?'low':'normal';
}
const RANGE_TEXT={high:'Above its typical range',normal:'Within its typical range',low:'Below its typical range',unknown:'No typical range published for this reading'};
export function connectRivers(map:Map,section:HTMLElement,schedule:(run:()=>Promise<boolean|void>,interval:number)=>void,get:(url:string)=>Promise<{data:RiverFeedItem[];warningsCurrent?:boolean}>,enabled:boolean,interval:number,disposed:()=>boolean){
 section.insertAdjacentHTML('beforeend','<label class="layer-row"><span><i>≈</i>River levels & flood warnings</span><input id="river-layer" type="checkbox" checked role="switch"></label><button id="river-summary" class="environment-summary">Rivers loading…</button>');
 const toggle=section.querySelector<HTMLInputElement>('#river-layer')!,summary=section.querySelector<HTMLButtonElement>('#river-summary')!;
 let gauges:RiverGauge[]=[],warnings:FloodWarning[]=[],warningsKnown=false;
 map.addSource('flood-areas',{type:'geojson',data:{type:'FeatureCollection',features:[]},attribution:'Environment Agency flood and river level data · OGL 3.0'});
 map.addSource('river-gauges',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
 const colour=['match',['get','severity'],1,SEVERITY_COLOUR[1],2,SEVERITY_COLOUR[2],SEVERITY_COLOUR[3]] as never;
 // Outlines sit under the 3D miniature so buildings stay legible inside a warning area.
 map.addLayer({id:'flood-area-fill',type:'fill',source:'flood-areas',paint:{'fill-color':colour,'fill-opacity':.22}},'reading-3d');
 map.addLayer({id:'flood-area-line',type:'line',source:'flood-areas',paint:{'line-color':colour,'line-width':['interpolate',['linear'],['zoom'],11,1,16,2.5],'line-dasharray':[3,2]}},'reading-3d');
 for(const [state,fill] of Object.entries(GAUGE_COLOUR))map.addImage(`river-gauge-${state}`,gaugeIcon(fill),{pixelRatio:2});
 map.addLayer({id:'river-gauge-points',type:'symbol',source:'river-gauges',layout:{'icon-image':['concat','river-gauge-',['get','state']],'icon-size':['interpolate',['linear'],['zoom'],11,.75,16,1.05],'icon-allow-overlap':true,'icon-ignore-placement':true},paint:{'icon-opacity':['case',['get','old'],.55,1]}});
 map.addLayer({id:'river-gauge-labels',type:'symbol',source:'river-gauges',minzoom:13.5,layout:{'text-field':['get','text'],'text-size':11,'text-offset':[0,1.25],'text-anchor':'top','text-font':['Noto Sans Regular']},paint:{'text-color':'#24506b','text-halo-color':'#ffffff','text-halo-width':1.4}});
 const layers=['flood-area-fill','flood-area-line','river-gauge-points','river-gauge-labels'];
 const show=()=>{for(const id of layers)map.setLayoutProperty(id,'visibility',toggle.checked?'visible':'none');};
 toggle.disabled=!enabled;toggle.addEventListener('change',show);registerSwitch('rivers',toggle);
 const gaugeDetail=(g:RiverGauge)=>{const state=rangeState(g),now=Date.now();
  detail(`<span class="pill">River gauge · measured</span><h2>${escape(g.label)}</h2><p>${escape(g.river)}${g.town&&g.town!==g.label?` · ${escape(g.town)}`:''}</p><dl>${g.levels.map(l=>`<dt>${escape(l.qualifier)}</dt><dd>${l.value.toFixed(2)} ${escape(l.unit)}<small>Read ${escape(time(l.readAt))}${now-Date.parse(l.readAt)>OLD_READING?' · older than usual; the gauge may not have reported since':''}</small><small>${escape(unitNote(l.unit))}</small></dd>`).join('')}${g.typicalLow!==undefined&&g.typicalHigh!==undefined?`<dt>Typical range</dt><dd>${g.typicalLow.toFixed(2)}–${g.typicalHigh.toFixed(2)} m<small>${escape(RANGE_TEXT[state])}</small></dd>`:''}${g.highestRecent?`<dt>Highest recent level</dt><dd>${g.highestRecent.value.toFixed(2)} m<small>${escape(new Date(g.highestRecent.at).toLocaleDateString('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short',year:'numeric'}))}</small></dd>`:''}</dl><p>This is the level measured at the gauge. The map does not predict where water would go.</p><a href="${escape(g.sourceUrl)}" target="_blank" rel="noopener">This gauge on Check for flooding (GOV.UK)</a><p>Environment Agency real-time data · OGL v3.0. Readings may be delayed or unvalidated.</p>`);};
 // Search: gauges by name, river or town, so "Thames" lists every Thames gauge.
 registerSearch('river',q=>rank(gauges,q,g=>[g.label,g.river,g.town??''],g=>g.label,MAX_HITS).map(({item:g})=>{const l=mainLevel(g);
  return {title:g.label,detail:`${g.river}${l?` · ${l.value.toFixed(2)} m · ${RANGE_TEXT[rangeState(g)].toLowerCase()}`:''}`,
   open:()=>{if(!toggle.checked&&!toggle.disabled){toggle.checked=true;toggle.dispatchEvent(new Event('change'));}map.flyTo({center:g.position,zoom:15,pitch:45});gaugeDetail(g);}};}));
 const warningHtml=(w:FloodWarning)=>`<section class="feed-card"><span class="pill" style="background:${SEVERITY_COLOUR[w.severityLevel]}33;color:var(--ink)">${escape(w.severity)}</span><h2>${escape(w.label)}</h2>${w.river?`<p>${escape(w.river)}</p>`:''}${w.message?`<p class="flood-message">${escape(w.message)}</p>`:''}<small>${w.raisedAt?`Raised ${escape(time(w.raisedAt))}`:''}${w.changedAt?` · message updated ${escape(time(w.changedAt))}`:''}</small>${w.area?'':`<p>${w.areaTooLarge?'The official outline is too large to store here, so this warning is listed but not drawn; the GOV.UK link shows it.':'The official outline could not be loaded, so this warning is listed but not drawn.'}</p>`}<p><a href="${escape(w.sourceUrl)}" target="_blank" rel="noopener">Official warning on GOV.UK</a></p></section>`;
 const warningDetail=(list:FloodWarning[])=>detail(`<span class="pill">Environment Agency</span>${list.map(warningHtml).join('')}<p>Shaded areas are the Environment Agency’s fixed warning areas, not a measured or modelled flood extent.</p><p>Contains Environment Agency data · OGL v3.0.</p>`);
 summary.addEventListener('click',()=>{if(warnings.length){warningDetail(warnings);return;}
  if(!gauges.length)return;detail(`<span class="pill">Rivers around Reading</span><h2>${warningsKnown?'No flood alerts or warnings in force':'Flood warnings could not be checked'}</h2><p>${gauges.length} Environment Agency gauges on the Thames and Kennet. Select a gauge on the map for its latest reading.</p><dl>${gauges.map(g=>{const l=mainLevel(g);return `<dt>${escape(g.label)} · ${escape(g.river)}</dt><dd>${l?`${l.value.toFixed(2)} ${escape(l.unit)}<small>${escape(RANGE_TEXT[rangeState(g)])} · read ${escape(time(l.readAt))}</small>`:'No reading'}</dd>`;}).join('')}</dl><p>Contains Environment Agency data · OGL v3.0.</p>`);});
 map.on('click','river-gauge-points',(e:MapLayerMouseEvent)=>{const g=gauges.find(g=>g.id===e.features?.[0]?.properties.id);if(g)gaugeDetail(g);});
 map.on('click','flood-area-fill',(e:MapLayerMouseEvent)=>{
  // Gauges take the click when both are under the pointer.
  if(map.queryRenderedFeatures(e.point,{layers:['river-gauge-points']}).length)return;
  const ids=new Set(e.features?.map(f=>f.properties.id));const hit=warnings.filter(w=>ids.has(w.id));if(hit.length)warningDetail(hit);});
 for(const id of ['river-gauge-points','flood-area-fill']){map.on('mouseenter',id,()=>{map.getCanvas().style.cursor='pointer';});map.on('mouseleave',id,()=>{map.getCanvas().style.cursor='';});}
 const render=()=>{const now=Date.now();
  (map.getSource('river-gauges') as GeoJSONSource).setData({type:'FeatureCollection',features:gauges.map(g=>{const l=mainLevel(g);return {type:'Feature',geometry:{type:'Point',coordinates:g.position},properties:{id:g.id,state:rangeState(g),old:!l||now-Date.parse(l.readAt)>OLD_READING,text:l?`${l.value.toFixed(2)} m`:''}};})});
  (map.getSource('flood-areas') as GeoJSONSource).setData({type:'FeatureCollection',features:warnings.filter(w=>w.area).sort((a,b)=>b.severityLevel-a.severityLevel).map(w=>({type:'Feature',geometry:w.area!,properties:{id:w.id,severity:w.severityLevel}}))});
  const counts=[1,2,3].map(s=>warnings.filter(w=>w.severityLevel===s).length);
  summary.textContent=warnings.length?[`${counts[0]} severe flood warning${counts[0]===1?'':'s'}`,`${counts[1]} flood warning${counts[1]===1?'':'s'}`,`${counts[2]} flood alert${counts[2]===1?'':'s'}`].filter((_,i)=>counts[i]).join(' · ')+' in force':!gauges.length?'River data unavailable':warningsKnown?`${gauges.length} gauges · no flood warnings in force`:`${gauges.length} gauges · flood warnings unavailable`;
  summary.classList.toggle('flood-active',warnings.length>0);
  // The same readings, boiled down for the mode cards. Gauges with no typical range are counted apart, never as normal.
  if(!gauges.length&&!warnings.length)publishFact('rivers',undefined);
  else{const state=(g:RiverGauge)=>rangeState(g),name=(g:RiverGauge)=>g.label;
   publishFact('rivers',{gauges:gauges.length,high:gauges.filter(g=>state(g)==='high').map(name),low:gauges.filter(g=>state(g)==='low').map(name),normal:gauges.filter(g=>state(g)==='normal').length,unknown:gauges.filter(g=>state(g)==='unknown').length,
    warnings:{severe:counts[0],warning:counts[1],alert:counts[2]},warningsKnown,at:Math.max(0,...gauges.map(g=>Date.parse(mainLevel(g)?.readAt??'')).filter(Number.isFinite))||now});}
 };
 if(!enabled){summary.textContent='River levels disabled';return;}
 schedule(async()=>{try{const data=await get('/api/v1/rivers');if(disposed())return;gauges=data.data.filter((i):i is RiverGauge=>i.kind==='gauge');warnings=data.data.filter((i):i is FloodWarning=>i.kind==='warning').sort((a,b)=>a.severityLevel-b.severityLevel);warningsKnown=data.warningsCurrent===true;render();return gauges.length>0;}
  catch{if(!disposed()){
   // A warning must not outlive a failed refresh on screen; gauges keep their own reading times.
   warnings=[];warningsKnown=false;render();if(!gauges.length)summary.textContent='River data unavailable';}return false;}},interval);
}
