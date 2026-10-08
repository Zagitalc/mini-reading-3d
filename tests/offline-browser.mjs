import {chromium,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
// Offline Explore (serves ./dist itself, so it can really switch the server off; build first with `npm run build`): what has been viewed is kept, the app reopens with no connection, live data is never kept, and the saved data can be cleared.
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const shots='test-results';await mkdir(shots,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.pbf':'application/x-protobuf','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const serve=()=>http.createServer(async(req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join('dist',name==='/'?'index.html':name);
 try{res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'});res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
});
let server=serve();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port,base=`http://127.0.0.1:${port}`;
const switchOff=()=>new Promise(r=>{server.closeAllConnections();server.close(r);});
const switchOn=()=>new Promise(r=>{server=serve();server.listen(port,'127.0.0.1',r);});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
let offline=false;
await context.route('**/api/v1/**',route=>{
 if(offline)return route.abort('internetdisconnected');
 const key=new URL(route.request().url()).pathname.slice(8);
 if(key.startsWith('traffic-tiles'))return route.fulfill({status:204});
 return route.fulfill({json:key==='config'?{tomtom:false,weather:false,fuel:false,rivers:false}:{version:1,data:[],routes:{}}});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const saved=()=>page.evaluate(async()=>{const out={};for(const k of await caches.keys())out[k]=(await (await caches.open(k)).keys()).length;return out;});
try{
 // First visit: the worker installs. A second load goes through it, so the app itself and the first view are saved.
 await page.goto(`${base}/?sw=on&mode=explore`);await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.reload();await page.locator('#loading').waitFor({state:'hidden'});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 // Look at the station, so buildings and detailed tiles are fetched and saved, and open one timetable file as a stop panel would.
 await page.locator('#landmark-buttons button').first().click();await page.waitForTimeout(3500);
 const timetable=await page.evaluate(async()=>{const index=await (await fetch('/data/bus-stops.json')).json();const url=index.stops.find(s=>s.timetableUrl).timetableUrl;const r=await fetch(url);return {url,ok:r.ok,validUntil:index.validUntil};});
 expect(timetable.ok).toBe(true);
 await expect.poll(async()=>{const c=await saved();return Object.entries(c).filter(([k,v])=>/tiles|chunks|timetables|static/.test(k)&&v>0).length;},{timeout:30000}).toBe(4);
 const before=await saved();console.log('saved online',JSON.stringify(before));
 // The whole app is saved, not only what this visit loaded.
 const list=JSON.parse(await readFile('dist/precache.json','utf8')).files;expect(list.length).toBeGreaterThan(10);
 expect(before['mr-static-v1']).toBeGreaterThanOrEqual(list.length);
 // Live data is never saved.
 expect(Object.keys(before).join(' ')).not.toMatch(/api/);
 await expect(page.locator('#offline-banner')).toBeHidden();

 // Offline: reload and the saved app opens.
 offline=true;await switchOff();await context.setOffline(true);
 await page.reload();await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
 await expect(page.locator('#offline-banner')).toBeVisible();await expect(page.locator('#offline-banner')).toContainText('You are offline');
 await expect(page.locator('.landmark-pin').first()).toBeVisible();
 const offlineFetch=await page.evaluate(async(url)=>{const out={};out.timetable=(await fetch(url)).ok;out.stops=(await fetch('/data/bus-stops.json')).ok;try{await fetch('/api/v1/fuel');out.api='answered';}catch{out.api='unavailable';}return out;},timetable.url);
 expect(offlineFetch).toEqual({timetable:true,stops:true,api:'unavailable'});
 await page.screenshot({path:`${shots}/offline-explore.png`});
 // The saved-data card.
 await page.locator('#data-button').click();
 await expect(page.locator('#offline-card')).toContainText(/map tiles?/);await expect(page.locator('#offline-card')).toContainText(/timetable files?/);
 await expect(page.locator('#offline-card')).toContainText('Live feeds are never saved');
 await page.screenshot({path:`${shots}/offline-card.png`});
 await page.locator('#clear-saved').click();
 await expect(page.locator('#offline-card')).toContainText('Nothing saved yet');
 expect(Object.values(await saved()).reduce((a,b)=>a+b,0)).toBe(0);

 // Back online: the banner goes.
 offline=false;await switchOn();await context.setOffline(false);
 await expect(page.locator('#offline-banner')).toBeHidden();
 expect(errors).toEqual([]);console.log('offline explore ok');
}finally{await browser.close();server.closeAllConnections();server.close();}
