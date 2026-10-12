import {fromLocal,toLocal} from './geo';
import type {LandmarkComponent} from './landmark-components';
import type {LngLat} from './types';

/** Where a train stands at a platform: the middle of the platform, the direction it runs, and the platform's length in metres. */
export interface PlatformStop{position:LngLat;bearing:number;length:number}

const round=(n:number,places:number)=>Math.round(n*10**places)/10**places;

/**
 * One stop per numbered platform, from the platform footprints in the landmark components. The platform's long axis gives the
 * direction (which way a train faces is not known, so the bearing is the one between 0 and 180). The footprint is the platform
 * surface, so the train is drawn beside and slightly over it rather than on a particular track.
 */
export function derivePlatformStops(components:LandmarkComponent[]):Record<string,PlatformStop>{
 const stops:Record<string,PlatformStop>={};
 for(const c of components){
  const ref=c.tags?.ref;if(c.kind!=='platform'||!ref)continue;
  const ring=c.rings[0].map(toLocal);let angle=0,longest=0;
  for(let i=1;i<ring.length;i++){const d=Math.hypot(ring[i][0]-ring[i-1][0],ring[i][1]-ring[i-1][1]);if(d>longest){longest=d;angle=Math.atan2(ring[i][1]-ring[i-1][1],ring[i][0]-ring[i-1][0]);}}
  const ux=Math.cos(angle),uy=Math.sin(angle),along=ring.map(p=>p[0]*ux+p[1]*uy),across=ring.map(p=>-p[0]*uy+p[1]*ux);
  const a=(Math.min(...along)+Math.max(...along))/2,b=(Math.min(...across)+Math.max(...across))/2;
  const position=fromLocal([a*ux-b*uy,a*uy+b*ux]);
  stops[ref]={position:[round(position[0],6),round(position[1],6)],bearing:round(((90-angle*180/Math.PI)%180+180)%180,1),length:Math.round(Math.max(...along)-Math.min(...along))};
 }
 return stops;
}
