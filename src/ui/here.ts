import type {Map as MLMap,GeoJSONSource} from 'maplibre-gl';
import {evidenceBadge,type Evidence} from '../../shared/evidence';
import {formatMetres,hereOrder,hereRadius,HERE_LIMIT,HERE_TITLES,type HereGroup} from '../../shared/here';
import {fromLocal,toLocal} from '../../shared/geo';
import type {LngLat} from '../../shared/types';
import {currentMode} from './modes';
import {escape} from './shell';
// "Around here" under the mode card: what the switched-on layers hold near the middle of the map, or near a spot the
// viewer has pinned. Layers register a provider for their own data (as they do for search), so this file never fetches
// anything and never switches a layer or a feed on. Selecting an item moves the map to it and opens its usual card.
export type HereItem={title:string;detail?:string;evidence:Evidence;metres:number;position:LngLat;open:()=>void};
export type HereArea={centre:LngLat;radius:number;zoom:number};
type Provider=(area:HereArea)=>HereItem[];
const providers=new globalThis.Map<HereGroup,Provider>();
let redraw:(()=>void)|undefined;
/** A layer offers its nearby items here. Registering again replaces the provider. */
export function registerHere(group:HereGroup,provider:Provider){providers.set(group,provider);redraw?.();}
/** A layer calls this when its data or its on/off switch changed. */
export const refreshHere=()=>redraw?.();
/** A ring of `radius` metres around `centre`, for drawing a pinned spot. */
export function ring(centre:LngLat,radius:number,steps=64):LngLat[] {
 const [x,y]=toLocal(centre);
 return Array.from({length:steps+1},(_,i)=>{const a=i/steps*2*Math.PI;return fromLocal([x+radius*Math.cos(a),y+radius*Math.sin(a)]);});
}
export function connectHere(map:MLMap,beforeJump:()=>void=()=>{}){
 const card=document.querySelector<HTMLDetailsElement>('#here-card')!,body=card.querySelector<HTMLElement>('#here-body')!;
 // Like the mode card, folded at first on a phone.
 if(matchMedia('(max-width:680px)').matches)card.open=false;
 let pinned:{centre:LngLat;radius:number}|undefined,shown:HereItem[]=[],last='',timer:ReturnType<typeof setTimeout>|undefined;
 map.addSource('here-area',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
 map.addLayer({id:'here-area',type:'line',source:'here-area',paint:{'line-color':'#2d6a5a','line-width':2,'line-dasharray':[3,2]}});
 const drawRing=()=>(map.getSource('here-area') as GeoJSONSource).setData({type:'FeatureCollection',features:pinned?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:ring(pinned.centre,pinned.radius)}}]:[]});
 const area=():HereArea=>{const c=map.getCenter(),zoom=map.getZoom();return pinned?{...pinned,zoom}:{centre:[c.lng,c.lat],radius:hereRadius(zoom),zoom};};
 const draw=()=>{
  timer=undefined;if(!card.open)return;
  const a=area();shown=[];
  const sections=hereOrder(currentMode()).map(group=>{
   let items:HereItem[]=[];try{items=providers.get(group)?.(a)??[];}catch{items=[];}
   items=items.slice(0,HERE_LIMIT[group]);if(!items.length)return '';
   const start=shown.length;shown.push(...items);
   return `<section class="here-group" aria-label="${escape(HERE_TITLES[group])}"><h3>${escape(HERE_TITLES[group])}</h3><ul>${items.map((it,i)=>`<li><button type="button" data-here="${start+i}"><span class="here-title">${escape(it.title)}</span><small>${evidenceBadge(it.evidence)}${[it.detail,it.metres>0?formatMetres(it.metres):''].filter(Boolean).map(escape).join(' · ')}</small></button></li>`).join('')}</ul></section>`;
  }).join('');
  const html=`<p class="here-where">${pinned?'Pinned spot':'Middle of the map'} · within ${escape(formatMetres(a.radius))}<button type="button" class="here-pin" aria-pressed="${!!pinned}">${pinned?'Unpin':'Pin this spot'}</button></p>${sections||`<p class="here-empty">Nothing on the layers you have switched on is within ${escape(formatMetres(a.radius))} of here. Zoom out or move the map.</p>`}<p class="here-note">Only switched-on layers are listed. Select an item to go to it.</p>`;
  if(html!==last){last=html;body.innerHTML=html;}
 };
 const later=()=>{if(timer===undefined)timer=setTimeout(draw,200);};
 redraw=later;
 body.addEventListener('click',e=>{
  const target=e.target as Element;
  if(target.closest('.here-pin')){if(pinned)pinned=undefined;else{const a=area();pinned={centre:a.centre,radius:a.radius};}drawRing();last='';draw();return;}
  const item=shown[Number((target.closest('[data-here]') as HTMLElement|null)?.dataset.here)];
  if(!item)return;
  beforeJump();map.easeTo({center:item.position,zoom:Math.max(map.getZoom(),15.5),duration:600});item.open();
 });
 card.addEventListener('toggle',()=>{if(card.open){last='';later();}});
 map.on('moveend',later);document.addEventListener('reading-mode',later);
 // Distances and "switched on" change without the map moving, so look again now and then.
 setInterval(()=>{if(!document.hidden)later();},60_000);
 draw();
}
