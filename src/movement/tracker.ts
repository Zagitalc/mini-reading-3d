import type {LngLat,VehicleObservation,VehicleTrack} from '../../shared/types';
import {alongLine,bearing,distance,inBounds,interpolate,nearestOnLine,validPosition} from '../../shared/geo';
export type VehiclePose={observation:VehicleObservation;position:LngLat;bearing:number;stale:boolean};
export class VehicleTracker {
 tracks=new Map<string,VehicleTrack>(); cancellations=new Map<string,number>();
 ingest(observations:VehicleObservation[],now=Date.now(),routes:Record<string,LngLat[]>={}){
  for(const o of observations){const time=Date.parse(o.observedAt),old=this.tracks.get(o.id);if(!validPosition(o.position)||!Number.isFinite(time)||time>now+60000||now-time>300000)continue;if(time<=(this.cancellations.get(o.id)??-Infinity))continue;if(old&&(Date.parse(old.current.observedAt)>time||Date.parse(old.current.observedAt)===time&&!o.cancelled))continue;
   if(o.cancelled){this.tracks.delete(o.id);this.cancellations.set(o.id,time);continue;}
   let route=o.tripId?routes[o.tripId]:undefined;
   if(route&&nearestOnLine(o.position,route).distance>65)route=undefined;
   // Discontinuous observations rebind immediately, never animate a jump through the city.
   const previous=old&&old.current.tripId===o.tripId&&distance(old.current.position,o.position)<(o.kind==='bus'?500:2000)?old.current:undefined;
   this.tracks.set(o.id,{current:o,previous,route,receivedAt:now});
  }
  this.prune(now);
 }
 prune(now=Date.now()){for(const[id,time]of this.cancellations)if(now-time>300000)this.cancellations.delete(id);for(const[id,t]of this.tracks)if(now-Date.parse(t.current.observedAt)>300000)this.tracks.delete(id);}
 poses(now=Date.now()):VehiclePose[]{this.prune(now);const out:VehiclePose[]=[];for(const t of this.tracks.values()){
  const o=t.current,interval=o.kind==='bus'?15000:30000,age=now-Date.parse(o.observedAt),stale=age>interval*2;
  let position=o.position,heading=o.bearing??0;
  const holding=o.stopUntil&&Date.parse(o.stopUntil)>now;
  if(!holding&&t.previous){const prev=t.previous,dt=Date.parse(o.observedAt)-Date.parse(prev.observedAt);const blend=Math.min(1,Math.max(0,(now-t.receivedAt)/Math.min(dt,interval)));if(t.route){const a=nearestOnLine(prev.position,t.route),b=nearestOnLine(o.position,t.route);if(a.distance<65&&b.distance<65&&b.along>=a.along){position=alongLine(t.route,a.along+(b.along-a.along)*blend);heading=bearing(position,alongLine(t.route,a.along+(b.along-a.along)*blend+3));}}else{position=interpolate(prev.position,o.position,blend);heading=o.bearing??bearing(prev.position,o.position);}}
  // Extrapolate only on a confirmed journey path, for at most one refresh interval.
  if(!holding&&!stale&&t.route&&o.speed&&now-t.receivedAt>interval){const n=nearestOnLine(o.position,t.route);position=alongLine(t.route,n.along+Math.min(interval,Math.max(0,age))*Math.min(o.speed,o.kind==='bus'?35:90)/1000);heading=bearing(position,alongLine(t.route,n.along+Math.min(interval,age)*o.speed/1000+3));}
  if(inBounds(position))out.push({observation:o,position,bearing:heading,stale});
 }return out;}
}
