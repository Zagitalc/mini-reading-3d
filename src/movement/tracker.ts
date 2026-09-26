import {CADENCE} from '../../shared/feed-policy';
import type {LngLat,VehicleObservation,VehicleTrack} from '../../shared/types';
import {alongLine,bearing,distance,inBounds,nearestOnLine,validPosition,lineLength} from '../../shared/geo';
export type VehiclePose={observation:VehicleObservation;position:LngLat;bearing:number;stale:boolean};
type Track=VehicleTrack&{motion?:{from:number;to:number;duration:number};anchor?:number};
const pathHeading=(route:LngLat[],at:number)=>bearing(alongLine(route,Math.max(0,at-3)),alongLine(route,Math.min(lineLength(route),at+3)));
export class VehicleTracker {
 tracks=new Map<string,Track>();cancellations=new Map<string,number>();
 ingest(observations:VehicleObservation[],now=Date.now(),routes:Record<string,LngLat[]>={}){
  for(const o of observations){
   const time=Date.parse(o.observedAt),old=this.tracks.get(o.id);
   if(!validPosition(o.position)||!Number.isFinite(time)||time>now+60000||now-time>300000)continue;
   if(time<=(this.cancellations.get(o.id)??-Infinity))continue;
   if(old&&(Date.parse(old.current.observedAt)>time||Date.parse(old.current.observedAt)===time&&!o.cancelled))continue;
   if(o.cancelled){this.tracks.delete(o.id);this.cancellations.set(o.id,time);continue;}
   let route=o.tripId?routes[o.tripId]:undefined;
   if(route&&(route.length<2||nearestOnLine(o.position,route).distance>(o.kind==='bus'?35:65)))route=undefined;
   const sameJourney=old&&old.current.label===o.label&&(old.current.journeyRef??old.current.tripId)===(o.journeyRef??o.tripId);
   const dt=old?time-Date.parse(old.current.observedAt):0;
   const previous=sameJourney&&dt>0&&dt<=180000&&distance(old.current.position,o.position)<(o.kind==='bus'?Math.min(1500,dt/1000*35+30):2000)?old.current:undefined;
   const track:Track={current:o,previous,route,receivedAt:now};
   if(route){
    const target=nearestOnLine(o.position,route);track.anchor=target.along;
    if(previous&&old){
     // Start at the displayed point so a new observation cannot restart animation behind the bus.
     const rendered=this.pose(old,now),start=nearestOnLine(rendered.position,route);
     if(start.distance<35&&target.along>=start.along&&target.along-start.along<=dt/1000*(o.kind==='bus'?35:90)+30)
      track.motion={from:start.along,to:target.along,duration:Math.min(dt,o.kind==='bus'?CADENCE.buses:CADENCE.trains)};
    }
   }
   this.tracks.set(o.id,track);
  }
  this.prune(now);
 }
 prune(now=Date.now()){for(const[id,time]of this.cancellations)if(now-time>300000)this.cancellations.delete(id);for(const[id,t]of this.tracks)if(now-Date.parse(t.current.observedAt)>300000)this.tracks.delete(id);}
 private pose(t:Track,now:number):VehiclePose{
  const o=t.current,interval=o.kind==='bus'?CADENCE.buses:CADENCE.trains,age=now-Date.parse(o.observedAt),stale=age>interval*2;
  let position=o.position,heading=Number.isFinite(o.bearing)?o.bearing!:0;
  const holding=o.stopUntil&&Date.parse(o.stopUntil)>now;
  if(t.route&&t.anchor!==undefined&&!holding){
   let at=t.anchor;
   if(t.motion){const blend=Math.min(1,Math.max(0,(now-t.receivedAt)/t.motion.duration));at=t.motion.from+(t.motion.to-t.motion.from)*blend;}
   if(o.kind==='train'&&!stale&&o.speed&&now-t.receivedAt>interval)at=t.anchor+Math.min(interval,Math.max(0,age))*Math.min(o.speed,90)/1000;
   position=alongLine(t.route,at);heading=pathHeading(t.route,at);
  }
  // Without a trusted path, retain the reported position. Straight-line tweening cuts through buildings.
  return{observation:o,position,bearing:heading,stale};
 }
 poses(now=Date.now()):VehiclePose[]{this.prune(now);return[...this.tracks.values()].map(t=>this.pose(t,now)).filter(p=>inBounds(p.position));}
}
