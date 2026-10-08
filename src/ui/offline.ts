import {escape,toast} from './shell';
// Registers the offline cache (public/sw.js), tells people when the connection drops, and reports what is saved on this device.
// Feed modules re-check their own data on the 'online' event.
const CACHE_PREFIX='mr-';
const KINDS:[string,string,string][]=[['tiles','map tile','map tiles'],['chunks','building chunk','building chunks'],['timetables','timetable file','timetable files']];
/** Browsers driven by test tools skip the worker unless asked, because it would stand between the page and the test's fake responses. */
const wanted=()=>import.meta.env.PROD&&'serviceWorker' in navigator&&(!navigator.webdriver||location.search.includes('sw=on'));
/** The panel footer while offline: areas not yet viewed have nothing saved to draw. */
export const OFFLINE_MAP_NOTE='Offline: only areas you have viewed are saved';
const COLLAPSE_MS=8000;
/** The top-bar feed status. Offline it always says so, whatever the last feed check reported. */
export function setFeedStatus(text:string,live:boolean){
 const offline=!navigator.onLine;
 document.querySelector('#overall-status')!.textContent=offline?'Offline':text;
 document.querySelector('.status-dot')!.classList.toggle('live',live&&!offline);
}
export function connectOffline(){
 // A button, so the full explanation can be brought back after it shrinks out of the way of the landmark buttons.
 const banner=document.createElement('button');banner.type='button';banner.id='offline-banner';banner.setAttribute('aria-live','polite');banner.hidden=true;
 banner.innerHTML='<span class="offline-short">Offline</span><span class="offline-long">You are offline. The map, buildings and timetables you have already viewed still work. Live buses, trains, traffic, weather and prices are unavailable.</span>';
 document.body.append(banner);
 let collapse:ReturnType<typeof setTimeout>|undefined;
 const expand=(open:boolean)=>{clearTimeout(collapse);banner.classList.toggle('collapsed',!open);banner.setAttribute('aria-expanded',String(open));if(open)collapse=setTimeout(()=>expand(false),COLLAPSE_MS);};
 banner.addEventListener('click',()=>expand(banner.classList.contains('collapsed')));
 const footer=()=>document.querySelector<HTMLElement>('#geography-status');
 const sync=()=>{
  banner.hidden=navigator.onLine;
  if(!navigator.onLine){expand(true);setFeedStatus('',false);const f=footer();if(f)f.textContent=OFFLINE_MAP_NOTE;}
  else{clearTimeout(collapse);const f=footer();if(f?.dataset.ok)f.textContent=f.dataset.ok;}
 };
 sync();
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
const mb=(bytes:number)=>`${Math.max(1,Math.round(bytes/1e6))} MB`;
type WholeMap={bytes:number;files:string[]};
let wholeMap:Promise<WholeMap|undefined>|undefined;
const wholeMapList=()=>wholeMap??=fetch('/offline-map.json').then(r=>r.ok?r.json() as Promise<WholeMap>:undefined).catch(()=>{wholeMap=undefined;return undefined;});
/** What of the whole map is not saved yet, looking across every saved cache whichever version name it has. */
async function missing(list:WholeMap){
 const have=new Set<string>();
 for(const name of (await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)))for(const r of await (await caches.open(name)).keys())have.add(new URL(r.url).pathname);
 return list.files.filter(file=>!have.has(file));
}
// One save at a time, kept across re-renders of the card so reopening the panel shows its progress.
let saving:{done:number;total:number;cancelled:boolean;failed:number}|undefined;
/** Fetches every tile and building chunk the device does not have yet, through the offline worker, which saves each one. */
async function saveWholeMap(files:string[],report:()=>void){
 const job={done:0,total:files.length,cancelled:false,failed:0};saving=job;report();
 try{await navigator.storage?.persist?.();}catch{/* the browser may decline; the files are still saved */}
 let next=0;
 const worker=async()=>{while(!job.cancelled&&next<files.length){const file=files[next++];try{const r=await fetch(file);if(!r.ok)job.failed++;await r.arrayBuffer();}catch{job.failed++;}job.done++;report();}};
 await Promise.all(Array.from({length:6},worker));
 saving=undefined;report();
 return job;
}
/** Fills the "Saved on this device" card in the Source & freshness panel. */
export async function fillOfflineCard(el:HTMLElement){
 const state=await saved();
 if(!el.isConnected)return;
 if(!state){el.innerHTML='<strong>Saved on this device</strong><p>This browser cannot save map data for offline use.</p>';return;}
 const lines=KINDS.map(([key,one,many])=>{const n=state.counts[key]??0;return `${n.toLocaleString('en-GB')} ${n===1?one:many}`;}).join(', '),empty=KINDS.every(([k])=>!state.counts[k]);
 el.innerHTML=`<strong>Saved on this device</strong><p>${empty?'Nothing saved yet. Maps, buildings and timetables you view are kept so they open without a connection.':'Saved for offline use: '+escape(lines)+'.'}${state.used?` This site uses about ${(state.used/1e6).toFixed(0)} MB in all.`:''}</p><p>Each stop shows the dates its timetable covers. Live feeds are never saved.</p><div id="whole-map"></div>${empty?'':'<button type="button" class="status-button" id="clear-saved">Clear saved map data</button>'}`;
 el.querySelector('#clear-saved')?.addEventListener('click',async()=>{
  if(saving)saving.cancelled=true;
  for(const name of (await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)))await caches.delete(name);
  toast('Saved map data cleared');void fillOfflineCard(el);
 });
 void fillWholeMap(el.querySelector<HTMLElement>('#whole-map')!,()=>void fillOfflineCard(el));
}
/** The "Save the whole map" part of the card: its size, progress while saving, and nothing once it is all saved. */
async function fillWholeMap(box:HTMLElement,refresh:()=>void){
 const progress=()=>{if(!box.isConnected||!saving)return;box.innerHTML=`<p>Saving the whole map: ${saving.done.toLocaleString('en-GB')} of ${saving.total.toLocaleString('en-GB')} files. You can keep using the map.</p><progress max="${saving.total}" value="${saving.done}"></progress><button type="button" class="status-button" id="cancel-whole-map">Stop</button>`;box.querySelector('#cancel-whole-map')!.addEventListener('click',()=>{if(saving)saving.cancelled=true;});};
 if(saving){progress();const watch=setInterval(()=>{if(!box.isConnected){clearInterval(watch);return;}if(saving)progress();else{clearInterval(watch);refresh();}},500);return;}
 const list=await wholeMapList();if(!box.isConnected)return;
 if(!list){box.innerHTML='';return;}
 const left=await missing(list);if(!box.isConnected)return;
 if(!left.length){box.innerHTML='<p>The whole map is saved: every map tile and building opens offline.</p>';return;}
 const share=left.length/list.files.length,size=list.bytes*share;
 if(!navigator.onLine){box.innerHTML=`<p>Areas you have not viewed are not saved. Connect to save the whole map (about ${mb(size)}).</p>`;return;}
 if(!navigator.serviceWorker?.controller){box.innerHTML='<p>To save the whole map for offline use, reload the page once first.</p>';return;}
 let room='';try{const est=await navigator.storage?.estimate?.();if(est?.quota&&est.usage!==undefined&&est.quota-est.usage<size*1.2)room=' This device may not have enough free space for it.';}catch{room='';}
 box.innerHTML=`<p>Only areas you have viewed are saved, so zooming out or going somewhere new offline shows blank ground. Save every map tile and building (about ${mb(size)}${share<1?' still to fetch':''}), ideally on Wi-Fi.${room}</p><button type="button" class="status-button" id="save-whole-map">Save the whole map</button>`;
 box.querySelector('#save-whole-map')!.addEventListener('click',async()=>{
  const job=await saveWholeMap(left,progress);
  toast(job.cancelled?'Stopped saving the map':job.failed?`Map saved, except ${job.failed} files that could not be fetched`:'The whole map is saved for offline use');
  refresh();
 });
}
