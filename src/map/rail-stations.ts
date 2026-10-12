import * as maplibregl from 'maplibre-gl';
import type {Map} from 'maplibre-gl';
import {LAYER_ZOOM} from '../../shared/layer-zoom';
import {NEARBY_STATIONS,STATION_POSITIONS} from '../../shared/rail-stations';
import {escape} from '../ui/shell';
import {setSelection} from '../ui/share';
import {MAX_HITS,registerSearch} from '../ui/search';
import {rank} from '../../shared/search';
import type {LngLat} from '../../shared/types';

const stations=Object.entries(NEARBY_STATIONS).map(([crs,name])=>({crs,name,position:STATION_POSITIONS[crs]as LngLat}));

/**
 * Pins for the railway stations around Reading, shown with the Trains layer from zoom 12.5. Each opens that station's next
 * departures, read from the board the shared rail refresh already saved, so a pin adds no provider requests. Only the pins in
 * view exist as page elements.
 */
export function connectRailStations(map:Map){
 const trains=document.querySelector<HTMLInputElement>('[data-layer=trains]');
 const pins=new globalThis.Map<string,maplibregl.Marker>();
 const open=async(s:typeof stations[number])=>{
  const {openStationBoard}=await import('./station-board');
  openStationBoard(()=>map.flyTo({center:s.position,zoom:17,pitch:60}),s);
  setSelection(undefined);
 };
 const sync=()=>{
  const show=(trains?.checked??true)&&map.getZoom()>=LAYER_ZOOM.railStations,bounds=map.getBounds();
  for(const s of stations){
   const want=show&&bounds.contains(s.position),pin=pins.get(s.crs);
   if(want&&!pin){
    const el=document.createElement('button');el.className='landmark-pin rail-station-pin';el.setAttribute('aria-label',`${s.name} station, live departures`);
    el.innerHTML=`▥<span class="pin-label">${escape(s.name)}</span>`;el.addEventListener('click',e=>{e.stopPropagation();void open(s);});
    pins.set(s.crs,new maplibregl.Marker({element:el}).setLngLat(s.position).addTo(map));
   }else if(!want&&pin){pin.remove();pins.delete(s.crs);}
  }
 };
 map.on('moveend',sync);trains?.addEventListener('change',sync);sync();
 map.on('remove',()=>{for(const pin of pins.values())pin.remove();pins.clear();});
 registerSearch('station',q=>rank(stations,q,s=>[s.name,`${s.name} station`],s=>s.name,MAX_HITS).map(({item:s})=>({title:`${s.name} station`,detail:'Live departures',open:()=>{map.flyTo({center:s.position,zoom:16.5,pitch:58});void open(s);}})));
}
