import {detail,escape,sourceFooter} from '../ui/shell';
import {storyHtml} from '../ui/landmark-story';
import {BOARD_STALE_MS,type RailBoardResponse,type RailDeparture,type StationBoard} from '../../shared/rail-board';
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});
let timer:ReturnType<typeof setInterval>|undefined,reload:(()=>void)|undefined;
// A hidden tab skips its refreshes, so coming back re-reads the board at once instead of showing the old one for up to a minute.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload?.();});
function expected(d:RailDeparture){
 if(d.cancelled)return '<span class="expected cancelled">Cancelled</span>';
 if(d.expected==='On time')return '<span class="expected">On time</span>';
 return `<span class="expected late">${/^\d\d:\d\d$/.test(d.expected)?`Expected ${escape(d.expected)}`:escape(d.expected)}</span>`;
}
function rows(board:StationBoard){
 if(!board.services.length)return '<p>No departures on this board. Darwin lists the next services within two hours.</p>';
 return `<ol class="departures rail-board">${board.services.map(d=>`<li class="${d.cancelled?'cancelled-service':''}"><time>${escape(d.scheduled)}</time><div><strong>${escape(d.destination)}</strong>${d.via?` <small>${escape(d.via)}</small>`:''}${expected(d)}<small>${escape(d.operator)}${d.reason?` · ${escape(d.reason)}`:''}</small></div><span class="platform">${d.platform?`Plat. ${escape(d.platform)}`:'<small>No platform yet</small>'}</span></li>`).join('')}</ol>`;
}
function render(element:HTMLElement,response:RailBoardResponse){
 const board=response.board;
 if(!response.configured){element.innerHTML='<p class="schedule-notice">Live departures are not configured on this server. An RDM API key is required.</p>';return;}
 if(!board){element.innerHTML='<p>Waiting for the first scheduled rail refresh. Try again in a minute.</p>';return;}
 const age=Date.now()-Date.parse(board.generatedAt),stale=!(age<BOARD_STALE_MS);
 element.innerHTML=`${stale?`<p class="schedule-notice">This board has not refreshed since ${clock.format(Date.parse(board.generatedAt))}. Times may be out of date.</p>`:''}<p class="departure-window">Next ${board.services.length} departures within two hours; trains that have just left may still be listed.</p>${rows(board)}${board.messages.length?`<div class="rail-messages"><h3>Station messages</h3>${board.messages.map(m=>`<p>${escape(m)}</p>`).join('')}</div>`:''}<p class="explorer-note">Platforms can change at short notice. Trains on the map are estimated from this data, not GPS positions.</p>${sourceFooter([['Source',`<a href="${escape(board.sourceUrl)}" target="_blank" rel="noopener">${escape(board.source)}</a>`],['Board generated',`${clock.format(Date.parse(board.generatedAt))} London time · refreshed once a minute for all viewers`]])}`;
}
/** Reading station's departure board from the shared rail refresh. Re-reads the server copy while open. */
export function openStationBoard(onFocus:()=>void){
 clearInterval(timer);
 detail('<span class="pill">Railway station · live departures</span><h2>Reading station</h2><div id="station-board" aria-live="polite"><p>Loading departures…</p></div><button class="status-button" id="focus-landmark">Take a closer look ↗</button>'+storyHtml('station'));
 document.querySelector('#focus-landmark')!.addEventListener('click',onFocus);
 const element=document.querySelector<HTMLElement>('#station-board')!;
 const load=async()=>{
  const panel=document.querySelector<HTMLElement>('#details')!;
  if(!element.isConnected||panel.hidden){clearInterval(timer);return;}
  if(document.hidden)return;
  try{const r=await fetch('/api/v1/rail-board',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Board unavailable');const data:RailBoardResponse=await r.json();if(element.isConnected)render(element,data);}
  catch{if(element.isConnected&&!element.querySelector('.departures'))element.innerHTML=navigator.onLine?'<p>The departure board could not load. Select the station again to retry.</p>':'<p>The live departure board needs a connection. Select the station again once you are back online.</p>';}
 };
 reload=()=>void load();void load();timer=setInterval(load,60_000);
}
