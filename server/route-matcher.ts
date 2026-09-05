import{nearestOnLine,bearing}from'../shared/geo';import type{LngLat,VehicleObservation}from'../shared/types';
export type BusNetwork={shapes:Record<string,LngLat[]>;trips:Record<string,string>[];routes:Record<string,string>[]};
export function matchBusRoute(o:VehicleObservation,network:BusNetwork):{observation:VehicleObservation;route?:LngLat[]}{
 const trip=network.trips.find(t=>t.trip_id===o.tripId);if(trip){const route=network.shapes[trip.shape_id];if(route&&nearestOnLine(o.position,route).distance<65)return{observation:{...o,tripId:trip.trip_id},route};}
 // BODS and GTFS identifiers often differ. Only accept an unambiguous line + heading + proximity match.
 const ids=new Set(network.routes.filter(r=>r.route_short_name===o.label||r.route_id===o.routeId).map(r=>r.route_id));const shapeIds=new Set(network.trips.filter(t=>ids.has(t.route_id)).map(t=>t.shape_id));const candidates=[...shapeIds].map(id=>{const route=network.shapes[id],near=nearestOnLine(o.position,route),heading=bearing(route[near.segment],route[near.segment+1]);const diff=o.bearing==null?0:Math.abs(((heading-o.bearing+540)%360)-180);return{id,route,near,diff};}).filter(c=>c.near.distance<35&&c.diff<45).sort((a,b)=>a.near.distance-b.near.distance);
 const best=candidates[0];if(!best)return{observation:o};if(candidates[1]&&candidates[1].near.distance-best.near.distance<12)return{observation:o};return{observation:{...o,tripId:`shape:${best.id}`},route:best.route};
}
