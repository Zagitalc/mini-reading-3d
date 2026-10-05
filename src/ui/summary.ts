import {summarise,type Facts} from '../../shared/summary';
import {freshObservation} from '../../shared/feed-policy';
import {currentMode} from './modes';
import {escape} from './shell';
import {subscribeVehicles} from '../map/vehicle-feed';
// The card under the mode buttons. Layers publish a small digest of what they already hold (`publishFact`); the card
// only reads those digests, so it never starts a request of its own and never keeps a layer's feed running.
const facts:Facts={};
let draw:(()=>void)|undefined,timer:ReturnType<typeof setTimeout>|undefined;
/** A layer reports its latest figures. Pass undefined to withdraw them. */
export function publishFact<K extends keyof Facts>(key:K,value:Facts[K]){
 facts[key]=value;
 // Several layers often publish in the same moment, so one redraw covers them.
 if(draw&&!timer)timer=setTimeout(()=>{timer=undefined;draw?.();},150);
}
export function connectSummary(){
 const card=document.querySelector<HTMLDetailsElement>('#mode-card')!,title=card.querySelector<HTMLElement>('#mode-card-title')!,body=card.querySelector<HTMLElement>('#mode-card-body')!;
 // A phone's panel is short; the card starts folded there and keeps whatever the viewer chooses afterwards.
 if(matchMedia('(max-width:680px)').matches)card.open=false;
 let last='';
 draw=()=>{
  const s=summarise(currentMode(),facts);
  const html=`<dl>${s.lines.map(l=>`<div class="mode-card-line${l.stale?' stale':''}"><dt>${escape(l.label)}</dt><dd>${escape(l.text)}${l.note?`<small>${l.stale?'May be out of date: ':''}${escape(l.note)}</small>`:''}</dd></div>`).join('')}</dl>${s.action?`<button type="button" class="mode-card-action" data-card-search>${escape(s.action.label)} →</button>`:''}`;
  title.textContent=s.title;if(html!==last){last=html;body.innerHTML=html;}
 };
 body.addEventListener('click',e=>{if((e.target as Element).closest('[data-card-search]')){const box=document.querySelector<HTMLInputElement>('#search');box?.focus();box?.select();}});
 document.addEventListener('reading-mode',()=>draw?.());
 // Ages on the card move on even when no layer has anything new to say.
 setInterval(()=>{if(!document.hidden)draw?.();},60_000);
 subscribeVehicles(u=>{
  // A failed refresh keeps the last figures, which then age on the card; with none yet, the card says unavailable.
  if(!u.vehicles){publishFact('vehicles',facts.vehicles??null);return;}
  const live=u.vehicles.filter(v=>freshObservation(v)),buses=live.filter(v=>v.kind==='bus');
  publishFact('vehicles',{buses:buses.length,busRoutes:new Set(buses.map(v=>v.routeGroupId??v.label)).size,trains:live.filter(v=>v.kind==='train').length,at:u.at});
 });
 draw();
}
