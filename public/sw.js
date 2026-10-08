/* Mini Reading offline cache.
 * Keeps what a person has already looked at (map tiles, building chunks, timetables, fonts and the app itself) so the map still opens
 * without a connection. Live data under /api/ is never touched: stale buses or prices must not look current. */
const VERSION=1;
const NAMES={static:`mr-static-v${VERSION}`,tiles:`mr-tiles-v${VERSION}`,chunks:`mr-chunks-v${VERSION}`,timetables:`mr-timetables-v${VERSION}`,data:`mr-data-v${VERSION}`};
// Entry limits bound the storage used (the whole map has 551 tiles, about 67 MB; a normal visit saves a small part of that). The oldest entries go first.
const LIMITS={static:200,tiles:600,chunks:500,timetables:600,data:40};
const NETWORK_WAIT_MS=6000;
/** How a same-origin GET is handled. 'pass' means the page's own request goes through untouched. */
function classify(pathname,mode='cors'){
 if(pathname.startsWith('/api/')||pathname==='/sw.js')return {strategy:'pass'};
 if(pathname.startsWith('/data/tiles/'))return {strategy:'cache-first',cache:'tiles'};
 // Timetable files sit in a folder named for their snapshot, so a file never changes under the same address.
 if(pathname.startsWith('/data/timetables/'))return {strategy:'cache-first',cache:'timetables'};
 if(pathname.startsWith('/data/chunks/'))return {strategy:'revalidate',cache:'chunks'};
 if(pathname.startsWith('/fonts/')||pathname.startsWith('/assets/'))return {strategy:'cache-first',cache:'static'};
 if(pathname.startsWith('/data/'))return {strategy:'network-first',cache:'data'};
 if(mode==='navigate'||pathname==='/'||pathname.endsWith('.html'))return {strategy:'network-first',cache:'static'};
 return {strategy:'network-first',cache:'static'};
}
const cacheable=r=>r&&r.status===200&&r.type!=='opaque';
async function trim(name,limit){
 const cache=await caches.open(NAMES[name]),keys=await cache.keys();
 for(const key of keys.slice(0,Math.max(0,keys.length-limit)))await cache.delete(key);
}
async function store(name,request,response){
 if(!cacheable(response))return;
 const cache=await caches.open(NAMES[name]);
 await cache.delete(request);await cache.put(request,response);
 await trim(name,LIMITS[name]);
}
const withTimeout=(promise,ms)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('slow')),ms);promise.then(v=>{clearTimeout(t);resolve(v);},e=>{clearTimeout(t);reject(e);});});
async function handle(request,rule){
 const cache=await caches.open(NAMES[rule.cache]);
 // A page address is saved under "/" so that any route into the app can start offline.
 const key=request.mode==='navigate'?new Request('/'):request;
 if(rule.strategy==='cache-first'){
  const hit=await cache.match(key);if(hit)return hit;
  const fresh=await fetch(request);await store(rule.cache,key,fresh.clone());return fresh;
 }
 if(rule.strategy==='revalidate'){
  const hit=await cache.match(key),update=fetch(request).then(async r=>{await store(rule.cache,key,r.clone());return r;});
  if(hit){update.catch(()=>{});return hit;}
  return update;
 }
 // network-first: take the network when it answers in time, and the saved copy when it does not.
 try{const fresh=await withTimeout(fetch(request),NETWORK_WAIT_MS);await store(rule.cache,key,fresh.clone());return fresh;}
 catch(error){const hit=await cache.match(key);if(hit)return hit;throw error;}
}
if(typeof self!=='undefined'&&typeof self.addEventListener==='function'&&typeof window==='undefined'){
 // Saves the whole app (every script and style in the build) on first install, so a panel nobody has opened yet still works offline.
 async function precache(){
  try{
   const list=await (await fetch('/precache.json',{cache:'no-store'})).json(),cache=await caches.open(NAMES.static);
   await Promise.all(['/',...list.files].map(async file=>{if(await cache.match(file))return;const r=await fetch(file);if(cacheable(r))await cache.put(file,r);}));
  }catch(error){/* offline or no list: the worker still caches pages as they are used */}
 }
 self.addEventListener('install',event=>event.waitUntil(precache().then(()=>self.skipWaiting())));
 self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keep=new Set(Object.values(NAMES));
  for(const key of await caches.keys())if(key.startsWith('mr-')&&!keep.has(key))await caches.delete(key);
  await self.clients.claim();
 })()));
 self.addEventListener('fetch',event=>{
  const {request}=event;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  // Range requests (media) and anything the browser marks no-store by design are left alone.
  if(request.headers.has('range'))return;
  const rule=classify(url.pathname,request.mode);if(rule.strategy==='pass')return;
  event.respondWith(handle(request,rule));
 });
}
// The unit tests load this file as a module and read the rules from here; a browser never sets it.
if(typeof globalThis.__MR_SW_TEST__==='object')globalThis.__MR_SW_TEST__.exports={classify,NAMES,LIMITS};
