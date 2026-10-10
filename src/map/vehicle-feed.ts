import type {LngLat,VehicleObservation} from '../../shared/types';
/** The latest vehicle refresh, shared between map layers. `vehicles` is null when the last refresh failed; `at` is the last success. */
export type VehicleUpdate={vehicles:VehicleObservation[]|null;at:number;routes?:Record<string,LngLat[]>};
let latest:VehicleUpdate|undefined;
export function publishVehicles(vehicles:VehicleObservation[]|null,now=Date.now(),routes?:Record<string,LngLat[]>){
 latest={vehicles,at:vehicles?now:latest?.at??0,routes};
 document.dispatchEvent(new CustomEvent('reading-vehicles',{detail:latest}));
}
/** Calls back with the latest refresh straight away, if there has been one, and then with each new one. */
export function subscribeVehicles(listener:(update:VehicleUpdate)=>void){
 const handler=(event:Event)=>listener((event as CustomEvent<VehicleUpdate>).detail);
 document.addEventListener('reading-vehicles',handler);if(latest)listener(latest);
 return ()=>document.removeEventListener('reading-vehicles',handler);
}
let demand=0;
/** Asks for vehicle updates while the bus and train layers are off, for a stop's live estimates for example.
 * Returns the function that withdraws the request. */
export function needVehicles(){
 demand++;document.dispatchEvent(new Event('reading-vehicles-needed'));
 let released=false;return ()=>{if(!released){released=true;demand--;}};
}
export const vehiclesNeeded=()=>demand>0;
