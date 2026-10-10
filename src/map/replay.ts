import type {Map} from 'maplibre-gl';
import {toolSlot,toast} from '../ui/shell';
import {evidenceBadge} from '../../shared/evidence';
import {ReplayBuffer,replayLength} from '../../shared/replay';
import {ReplayPlayer} from '../movement/replay-player';
import type {VehiclePose} from '../movement/tracker';
import {subscribeVehicles} from './vehicle-feed';

const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const SPEEDS=[10,30,60];

const buffer=new ReplayBuffer();
let player:ReplayPlayer|undefined,time=0;

/** The replayed positions at the replay clock, or undefined while the map is live. */
export const replayPoses=():VehiclePose[]|undefined=>player?player.poses(time):undefined;
export const isReplaying=()=>player!==undefined;
export const replayClock=()=>time;
export const formatReplayTime=(at:number)=>clock.format(at);
const changed=()=>document.dispatchEvent(new Event('reading-replay'));

/**
 * Tools > "Replay": plays back the bus and train positions this browser has already received, up to the last hour.
 * The buffer fills only while vehicles are being fetched (the Buses or Trains layer is on) and is empty after a reload.
 */
export function connectReplay(map:Map){
 subscribeVehicles(update=>{if(update.vehicles)buffer.push(update.vehicles,update.at,update.routes);});
 const section=document.createElement('section');section.className='route-control replay-control';
 section.innerHTML='<button type="button" class="layer-row replay-open" aria-pressed="false"><span><i>↺</i>Replay<small>Buses and trains seen on this device</small></span><span aria-hidden="true">▶</span></button>';
 toolSlot('replay').append(section);
 const bar=document.createElement('div');bar.className='replay-bar';bar.hidden=true;bar.setAttribute('role','region');bar.setAttribute('aria-label','Replay of earlier vehicle positions');
 bar.innerHTML=`<div class="replay-row"><button type="button" class="replay-play" aria-label="Play">▶</button><input type="range" class="replay-slider" aria-label="Replay time" min="0" max="1" step="1" value="0"><output class="replay-time" aria-live="off"></output><button type="button" class="replay-speed" aria-label="Replay speed"></button><button type="button" class="replay-live">Back to live</button></div><p class="replay-note">${evidenceBadge('historical')} <span class="replay-length"></span></p>`;
 document.body.append(bar);
 const open=section.querySelector<HTMLButtonElement>('.replay-open')!,play=bar.querySelector<HTMLButtonElement>('.replay-play')!,slider=bar.querySelector<HTMLInputElement>('.replay-slider')!,label=bar.querySelector<HTMLElement>('.replay-time')!,speedButton=bar.querySelector<HTMLButtonElement>('.replay-speed')!,length=bar.querySelector<HTMLElement>('.replay-length')!;
 let playing=false,speed=SPEEDS[1],frame=0,last=0;
 const show=()=>{
  const span=buffer.span;if(!span)return;
  slider.min=String(span.from);slider.max=String(span.to);slider.value=String(Math.round(time));
  label.textContent=`${clock.format(time)} · ${replayLength(Date.now()-time)} ago`;
  length.textContent=`Replaying ${replayLength(span.to-span.from)} of positions seen on this device. Not live.`;
  play.textContent=playing?'❚❚':'▶';play.setAttribute('aria-label',playing?'Pause':'Play');speedButton.textContent=`${speed}×`;
 };
 const tick=(now:number)=>{
  if(!player)return;
  const span=buffer.span;
  if(playing&&span){time=Math.min(span.to,time+(now-last)*speed);if(time>=span.to)playing=false;changed();}
  last=now;show();frame=requestAnimationFrame(tick);
 };
 const start=()=>{
  if(!buffer.ready){toast('Replay needs a minute or two of live positions first. Switch on Buses or Trains and wait.');return;}
  player=new ReplayPlayer(buffer);time=buffer.span!.from;playing=true;last=performance.now();
  bar.hidden=false;open.setAttribute('aria-pressed','true');document.body.classList.add('replaying');changed();show();frame=requestAnimationFrame(tick);
 };
 const stop=()=>{
  cancelAnimationFrame(frame);player=undefined;playing=false;bar.hidden=true;open.setAttribute('aria-pressed','false');document.body.classList.remove('replaying');changed();
 };
 open.addEventListener('click',()=>player?stop():start());
 bar.querySelector('.replay-live')!.addEventListener('click',stop);
 play.addEventListener('click',()=>{const span=buffer.span;if(!span)return;if(!playing&&time>=span.to)time=span.from;playing=!playing;last=performance.now();show();});
 speedButton.addEventListener('click',()=>{speed=SPEEDS[(SPEEDS.indexOf(speed)+1)%SPEEDS.length];show();});
 slider.addEventListener('input',()=>{time=Number(slider.value);playing=false;changed();show();map.triggerRepaint();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&player&&!bar.hidden&&document.activeElement===document.body)stop();});
 // Test hook: lets browser tests read how much has been buffered without waiting for real refreshes.
 (window as unknown as {__replay?:unknown}).__replay={frames:()=>buffer.frames.length,time:()=>time,active:()=>player!==undefined};
}
