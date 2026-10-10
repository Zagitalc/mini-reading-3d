import {ReplayBuffer,type ReplayFrame} from '../../shared/replay';
import {VehicleTracker,type VehiclePose} from './tracker';

/**
 * Plays a ReplayBuffer through the same tracker as the live map, so replayed buses keep to their routes between
 * snapshots. Moving forward feeds in each snapshot as its time passes; moving back starts again from the one before.
 */
export class ReplayPlayer {
 private tracker=new VehicleTracker();private last:ReplayFrame|undefined;
 constructor(private buffer:ReplayBuffer){}
 poses(time:number):VehiclePose[]{
  const frames=this.buffer.frames,target=this.buffer.indexAt(time);
  if(target<0)return [];
  let from=this.last?frames.indexOf(this.last)+1:0;
  // Going back in time, or the last snapshot played has since left the buffer: start again.
  if(this.last&&(this.last.at>frames[target].at||from===0)){this.tracker=new VehicleTracker();this.last=undefined;from=0;}
  // Start from the snapshot before the target when jumping, so the second can animate from the first.
  if(!this.last)from=Math.max(0,target-1);
  for(let i=from;i<=target;i++){this.tracker.ingest(frames[i].vehicles,frames[i].at,this.buffer.routes);this.last=frames[i];}
  return this.tracker.poses(time);
 }
}
