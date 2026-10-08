import {escape,toast} from './shell';
// Registers the offline cache (public/sw.js), tells people when the connection drops, and reports what is saved on this device.
const CACHE_PREFIX='mr-';
const KINDS:[string,string,string][]=[['tiles','map tile','map tiles'],['chunks','building chunk','building chunks'],['timetables','timetable file','timetable files']];
/** Browsers driven by test tools skip the worker unless asked, because it would stand between the page and the test's fake responses. */
const wanted=()=>import.meta.env.PROD&&'serviceWorker' in navigator&&(!navigator.webdriver||location.search.includes('sw=on'));
export function connectOffline(){
 const banner=document.createElement('div');banner.id='offline-banner';banner.setAttribute('role','status');banner.hidden=true;
 banner.textContent='You are offline. The map, buildings and timetables you have already viewed still work. Live buses, trains, traffic, weather and prices are unavailable.';
 document.body.append(banner);
 const sync=()=>{banner.hidden=navigator.onLine;};sync();
 window.addEventListener('offline',sync);
 window.addEventListener('online',()=>{sync();toast('Back online');});
 if(wanted())window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});},{once:true});
}
async function saved(){
 if(!('caches' in window))return undefined;
 const names=(await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)),counts:Record<string,number>={};
 for(const name of names)counts[name.replace(/^mr-|-v\d+$/g,'')]=(await (await caches.open(name)).keys()).length;
 let used:number|undefined;try{used=(await navigator.storage?.estimate?.())?.usage;}catch{used=undefined;}
 return {counts,used};
}
/** Fills the "Saved on this device" card in the Source & freshness panel. */
export async function fillOfflineCard(el:HTMLElement){
 const state=await saved();
 if(!el.isConnected)return;
 if(!state){el.innerHTML='<strong>Saved on this device</strong><p>This browser cannot save map data for offline use.</p>';return;}
 const lines=KINDS.map(([key,one,many])=>{const n=state.counts[key]??0;return `${n.toLocaleString('en-GB')} ${n===1?one:many}`;}).join(', '),empty=KINDS.every(([k])=>!state.counts[k]);
 el.innerHTML=`<strong>Saved on this device</strong><p>${empty?'Nothing saved yet. Maps, buildings and timetables you view are kept so they open without a connection.':'Saved for offline use: '+escape(lines)+'.'}${state.used?` This site uses about ${(state.used/1e6).toFixed(0)} MB in all.`:''}</p><p>Each stop shows the dates its timetable covers. Live feeds are never saved.</p>${empty?'':'<button type="button" class="status-button" id="clear-saved">Clear saved map data</button>'}`;
 el.querySelector('#clear-saved')?.addEventListener('click',async()=>{
  for(const name of (await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)))await caches.delete(name);
  toast('Saved map data cleared');void fillOfflineCard(el);
 });
}
