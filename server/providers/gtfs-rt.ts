/** The journey a vehicle is running, as the BODS GTFS-RT feed states it. */
export interface VehicleTrip {vehicleId:string;tripId:string;routeId?:string;startDate?:string;timestamp?:number}

// Just enough protobuf to read GTFS-RT vehicle positions: FeedMessage.entity (2) → FeedEntity.vehicle (4) →
// VehiclePosition.trip (1: trip_id 1, start_date 3, route_id 5), .vehicle (8: id 1, label 2, licence plate 3)
// and .timestamp (5). Unknown fields are skipped by wire type.
function fields(bytes:Uint8Array,start=0,end=bytes.length){
 const out:{field:number;value:number|Uint8Array}[]=[];let i=start;
 const varint=()=>{let result=0,scale=1,byte:number;do{if(i>=end)throw Error('Truncated protobuf');byte=bytes[i++];result+=(byte&0x7f)*scale;scale*=128;}while(byte&0x80);return result;};
 while(i<end){
  const key=varint(),field=Math.floor(key/8),type=key&7;
  if(type===0)out.push({field,value:varint()});
  else if(type===2){const length=varint();if(i+length>end)throw Error('Truncated protobuf');out.push({field,value:bytes.subarray(i,i+length)});i+=length;}
  else if(type===1)i+=8;else if(type===5)i+=4;else throw Error('Unsupported protobuf wire type');
 }
 return out;
}
const text=(value:number|Uint8Array|undefined)=>value instanceof Uint8Array?new TextDecoder().decode(value):undefined;
const message=(value:number|Uint8Array|undefined)=>value instanceof Uint8Array?fields(value):[];
const first=(list:{field:number;value:number|Uint8Array}[],field:number)=>list.find(f=>f.field===field)?.value;

export function parseVehicleTrips(bytes:Uint8Array):VehicleTrip[]{
 const result:VehicleTrip[]=[];
 for(const entity of fields(bytes))if(entity.field===2){
  const position=message(first(message(entity.value),4));if(!position.length)continue;
  const trip=message(first(position,1)),vehicle=message(first(position,8));
  const tripId=text(first(trip,1)),vehicleId=text(first(vehicle,1))??text(first(vehicle,3))??text(first(vehicle,2)),timestamp=first(position,5);
  if(!tripId||!vehicleId)continue;
  result.push({vehicleId,tripId,routeId:text(first(trip,5)),startDate:text(first(trip,3)),timestamp:typeof timestamp==='number'?timestamp*1000:undefined});
 }
 return result;
}

export async function fetchVehicleTrips(key:string){
 const url=new URL('https://data.bus-data.dft.gov.uk/api/v1/gtfsrtdatafeed/');url.searchParams.set('api_key',key);url.searchParams.set('boundingBox','-1.09,51.38,-0.83,51.51');
 const r=await fetch(url,{headers:{'User-Agent':'MiniReading3D/1.0 (+https://github.com/Zagitalc/mini-reading-3d)','Accept':'application/x-protobuf, application/octet-stream'},redirect:'manual',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error(`GTFS-RT provider returned HTTP ${r.status}`);
 return parseVehicleTrips(new Uint8Array(await r.arrayBuffer()));
}
