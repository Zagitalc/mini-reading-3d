import {nearestOnLine,bearing,distance,alongLine,lineLength} from '../shared/geo';
import {busColour} from '../shared/bus-style';
import type {LngLat,VehicleObservation} from '../shared/types';
export type BusNetwork={shapes:Record<string,LngLat[]>;trips:Record<string,string>[];routes:Record<string,string>[]};
const indexes=new WeakMap<BusNetwork,ReturnType<typeof indexNetwork>>();
function indexNetwork(n:BusNetwork){
 const trips=new Map(n.trips.map(t=>[t.trip_id,t])),shapes=new Map<string,Set<string>>();
 for(const t of n.trips){if(!shapes.has(t.route_id))shapes.set(t.route_id,new Set());shapes.get(t.route_id)!.add(t.shape_id);}
 const canonical=new Map<string,string>(),ids=new Map<string,string>();
 for(const[id,line]of Object.entries(n.shapes)){const key=JSON.stringify(line);if(!canonical.has(key))canonical.set(key,id);ids.set(id,canonical.get(key)!);}
 return {trips,shapes,ids};
}
const angleDifference=(a:number,b:number)=>Math.abs(((a-b+540)%360)-180);
export function matchBusRoute(o:VehicleObservation,n:BusNetwork,previous?:VehicleObservation):{observation:VehicleObservation;route?:LngLat[]}{
 let index=indexes.get(n);if(!index){index=indexNetwork(n);indexes.set(n,index);}
 const reading=!o.operatorId||/^(RGB|RBUS|READING)$/i.test(o.operatorId);
 const trip=index.trips.get(o.tripId??'');
 const routes=n.routes.filter(r=>(trip&&r.route_id===trip.route_id)||r.route_id===o.routeId||(reading&&r.route_short_name.toLowerCase()===o.label.trim().toLowerCase()));
 const group=routes.length===1?routes[0]:undefined;
 const observation={...o,journeyRef:o.journeyRef??o.tripId,...(group?{routeGroupId:group.route_id,routeColour:busColour(group.route_id,group.route_short_name)}:{})};
 const dt=previous?(Date.parse(o.observedAt)-Date.parse(previous.observedAt))/1000:0;
 const prior=previous&&dt>0&&dt<=180&&previous.label===o.label&&previous.operatorId===o.operatorId&&
  (previous.journeyRef??previous.tripId)===(o.journeyRef??o.tripId)?previous:undefined;
 const heading=Number.isFinite(o.bearing)?o.bearing:prior&&distance(prior.position,o.position)>15?bearing(prior.position,o.position):undefined;
 const shapes=new Set(routes.flatMap(r=>[...(index!.shapes.get(r.route_id)??[])].map(id=>index!.ids.get(id)!)));
 const candidates=[...shapes].flatMap(id=>{
  const route=n.shapes[id];if(!route||route.length<2)return[];
  const near=nearestOnLine(o.position,route);if(near.distance>35)return[];
  const direction=bearing(route[near.segment],route[near.segment+1]),diff=heading==null?0:angleDifference(direction,heading);
  if(diff>70)return[];
  const before=prior?nearestOnLine(prior.position,route):undefined;
  if(before&&(before.distance>35||near.along<before.along-12||near.along-before.along>dt*35+30))return[];
  return[{id,route,near,length:lineLength(route),score:near.distance+diff*.12+(before?.distance??0)*.25}];
 }).sort((a,b)=>a.score-b.score||a.id.localeCompare(b.id));
 const exact=trip&&candidates.find(c=>c.id===index!.ids.get(trip.shape_id));
 const best=exact||candidates[0];if(!best)return{observation};
 const select=(route:LngLat[],id:string,routeMatch:VehicleObservation['routeMatch'])=>({observation:{...observation,tripId:id,routeMatch},route});
 if(exact)return select(best.route,`shape:${best.id}`,'trip');
 const alternatives=candidates.filter(c=>c.score-best.score<12);
 if(alternatives.length===1)return select(best.route,`shape:${best.id}`,'direction');
 // Branch variants often share this street. Return only their common local corridor,
 // never select an unobserved future branch merely because its shape sorted first.
 const common=(delta:number)=>alternatives.every(c=>c.near.along+delta>=0&&c.near.along+delta<=c.length&&distance(alongLine(best.route,best.near.along+delta),alongLine(c.route,c.near.along+delta))<8);
 if(!common(0))return{observation};
 const backLimit=prior?Math.min(1600,Math.max(100,best.near.along-nearestOnLine(prior.position,best.route).along+30)):100;
 let back=0,forward=0;
 while(back<backLimit&&common(-back-10))back+=10;
 while(forward<100&&common(forward+10))forward+=10;
 if(back+forward<20)return{observation};
 const start=best.near.along-back,end=best.near.along+forward;
 const corridor:LngLat[]=[alongLine(best.route,start)];let run=0;
 for(let i=1;i<best.route.length;i++){run+=distance(best.route[i-1],best.route[i]);if(run>start&&run<end)corridor.push(best.route[i]);}
 corridor.push(alongLine(best.route,end));
 return select(corridor,`corridor:${o.id}`,'shared');
}
