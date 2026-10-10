import type {LngLat,VehicleObservation} from './types';

/** How much history the replay keeps, how close two kept snapshots may be, and a hard cap on memory. */
export const REPLAY_WINDOW=3_600_000,REPLAY_MIN_GAP=10_000,REPLAY_MAX_FRAMES=240,REPLAY_MIN_FRAMES=2;
export interface ReplayFrame{at:number;vehicles:VehicleObservation[]}

/**
 * The vehicle snapshots one browser has already received. Nothing is stored or fetched: it holds up to the
 * last hour since the page opened and is empty again after a reload.
 */
export class ReplayBuffer {
 frames:ReplayFrame[]=[];
 /** Journey shapes by trip id, merged over every snapshot, so replayed vehicles still follow their routes. */
 routes:Record<string,LngLat[]>={};
 push(vehicles:VehicleObservation[],at:number,routes:Record<string,LngLat[]>={}){
  const last=this.frames.at(-1);
  if(last&&at-last.at<REPLAY_MIN_GAP)return false;
  this.frames.push({at,vehicles});
  for(const v of vehicles)if(v.tripId&&routes[v.tripId])this.routes[v.tripId]=routes[v.tripId];
  while(this.frames.length>1&&(at-this.frames[0].at>REPLAY_WINDOW||this.frames.length>REPLAY_MAX_FRAMES))this.frames.shift();
  if(Object.keys(this.routes).length>600){const used=new Set(this.frames.flatMap(f=>f.vehicles.map(v=>v.tripId)));for(const id of Object.keys(this.routes))if(!used.has(id))delete this.routes[id];}
  return true;
 }
 /** Index of the latest snapshot at or before `time`, or -1 before the first. */
 indexAt(time:number){let lo=0,hi=this.frames.length-1,found=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(this.frames[mid].at<=time){found=mid;lo=mid+1;}else hi=mid-1;}return found;}
 get span(){return this.frames.length?{from:this.frames[0].at,to:this.frames.at(-1)!.at,count:this.frames.length}:undefined;}
 get ready(){return this.frames.length>=REPLAY_MIN_FRAMES;}
}

/** "23 minutes", "1 minute", "under a minute". */
export function replayLength(ms:number){const m=Math.round(ms/60000);return m<1?'under a minute':`${m} ${m===1?'minute':'minutes'}`;}
