import {nearestOnLine,bearing} from '../shared/geo';
import {busColour} from '../shared/bus-style';
import type {LngLat,VehicleObservation} from '../shared/types';
export type BusNetwork={shapes:Record<string,LngLat[]>;trips:Record<string,string>[];routes:Record<string,string>[]};
const indexes=new WeakMap<BusNetwork,ReturnType<typeof indexNetwork>>();
function indexNetwork(n:BusNetwork) {
 const trips=new Map(n.trips.map(t=>[t.trip_id,t]));
 const shapes=new Map<string,Set<string>>();
 for(const t of n.trips){if(!shapes.has(t.route_id))shapes.set(t.route_id,new Set());shapes.get(t.route_id)!.add(t.shape_id);}
 // Identical timetable shapes should not make a match appear ambiguous.
 const canonical=new Map<string,string>(),ids=new Map<string,string>();
 for(const [id,line] of Object.entries(n.shapes)){const key=JSON.stringify(line);if(!canonical.has(key))canonical.set(key,id);ids.set(id,canonical.get(key)!);}
 return {trips,shapes,ids};
}
export function matchBusRoute(o:VehicleObservation,n:BusNetwork):{observation:VehicleObservation;route?:LngLat[]} {
 let index=indexes.get(n);if(!index){index=indexNetwork(n);indexes.set(n,index);}
 const trip=index.trips.get(o.tripId??'');
 const reading=!o.operatorId||/^(RGB|RBUS|READING)$/i.test(o.operatorId);
 const routes=n.routes.filter(r=>r.route_id===trip?.route_id||r.route_id===o.routeId||(reading&&r.route_short_name.toLowerCase()===o.label.trim().toLowerCase()));
 const group=routes.length===1?routes[0]:undefined;
 const observation=group?{...o,routeGroupId:group.route_id,routeColour:busColour(group.route_id,group.route_short_name)}:o;
 if(trip){const route=n.shapes[trip.shape_id];if(route?.length>=2&&nearestOnLine(o.position,route).distance<65)return{observation:{...observation,tripId:`shape:${index.ids.get(trip.shape_id)}`},route};}
 const shapes=new Set(routes.flatMap(r=>[...(index!.shapes.get(r.route_id)??[])].map(id=>index!.ids.get(id)!)));
 const candidates=[...shapes].flatMap(id=>{const route=n.shapes[id];if(!route||route.length<2)return[];const near=nearestOnLine(o.position,route);if(near.distance>=35)return[];const heading=bearing(route[near.segment],route[near.segment+1]);const diff=o.bearing==null?0:Math.abs(((heading-o.bearing+540)%360)-180);return diff<45?[{id,route,near}]:[];}).sort((a,b)=>a.near.distance-b.near.distance);
 const best=candidates[0];if(!best||candidates[1]&&candidates[1].near.distance-best.near.distance<12)return{observation};
 return{observation:{...observation,tripId:`shape:${best.id}`},route:best.route};
}
