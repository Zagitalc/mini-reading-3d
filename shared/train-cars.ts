import {bearing,distance,fromLocal,alongLine,lineLength,toLocal} from './geo';
import type {LngLat} from './types';

/** Drawn when the feed does not say how long a train is (the Elizabeth line reports 0). */
export const DEFAULT_CARS=3;
export const MAX_CARS=12;
/** Body length and spacing of one car in metres; the 1 m difference is the gap at the coupling. */
export const CAR_LENGTH=20;
export const CAR_PITCH=21;

export interface CarPose{position:LngLat;bearing:number}

/** How many cars to draw for a train reporting `cars`. */
export const carsShown=(cars?:number)=>cars??DEFAULT_CARS;

/** The number of cars from a Darwin `length` field, or undefined when it is missing, 0 (unknown) or not a plausible count. */
export function carCount(value:unknown):number|undefined{
 const n=typeof value==='number'?value:typeof value==='string'&&/^\s*\d{1,2}\s*$/.test(value)?Number(value):NaN;
 return Number.isInteger(n)&&n>=1&&n<=MAX_CARS?n:undefined;
}

// A point `d` metres along the route; before its start it carries straight on backwards along the first segment.
function pointAt(route:LngLat[],d:number,length:number):LngLat{
 if(d>=0)return alongLine(route,Math.min(d,length));
 const a=toLocal(route[0]),b=toLocal(alongLine(route,Math.min(length,5))),run=Math.hypot(b[0]-a[0],b[1]-a[1]);
 if(!run)return route[0];
 return fromLocal([a[0]+(b[0]-a[0])/run*d,a[1]+(b[1]-a[1])/run*d]);
}

/**
 * Where each car of a train is when its lead car is `lead` metres along `route`. Every car sits on the track behind
 * the one in front and points along the chord between its own two ends, so a long train bends round a curve.
 * `fallback` is the heading used where a car is too short of track to measure one.
 */
export function carPoses(route:LngLat[],lead:number,count:number,fallback=0,pitch=CAR_PITCH,length=CAR_LENGTH):CarPose[]{
 const total=lineLength(route),half=length/2,out:CarPose[]=[];
 if(route.length<2||!total)return out;
 for(let i=0;i<Math.max(1,Math.min(MAX_CARS,Math.floor(count)));i++){
  const centre=lead-i*pitch,front=pointAt(route,centre+half,total),rear=pointAt(route,centre-half,total);
  out.push({position:pointAt(route,centre,total),bearing:distance(front,rear)>1?bearing(rear,front):out.at(-1)?.bearing??fallback});
 }
 return out;
}
