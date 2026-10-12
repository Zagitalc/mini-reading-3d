import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
// Trains standing at Reading's platforms are drawn, centred on the platform, and the platform canopies do not hide them.
const base=process.env.APP_URL??'http://127.0.0.1:8790';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
// What the Worker sends for an 8-car train about to leave platform 10 and a train that has just arrived at platform 7 (from standingPlace).
const routes={starts:[[-0.974872788725989,51.459548743828535],[-0.9703212112740108,51.45907925496411]],ends:[[-0.9753800467807494,51.45923314931203],[-0.9709499532192506,51.45886484994494]]};
const trains=at=>[
 {id:'darwin:starts',kind:'train',cars:8,position:[-0.9715515595539986,51.45920616414903],bearing:99.4,tripId:'starts',observedAt:new Date(at).toISOString(),status:'estimated',stopUntil:new Date(at+240000).toISOString(),destination:'London Paddington',label:'GWR',source:'test'},
 {id:'darwin:ends',kind:'train',position:[-0.9728648968877692,51.45902405068121],bearing:97.6,tripId:'ends',observedAt:new Date(at).toISOString(),status:'estimated',stopUntil:new Date(at+240000).toISOString(),destination:'Reading',label:'GWR',source:'test'}];
try{
 const page=await browser.newPage({viewport:{width:1300,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.readingTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.readingTools[t.name]=t.execute;}}});});
 await page.route('**/api/v1/**',req=>{const key=new URL(req.request().url()).pathname.slice(8);
  if(key.startsWith('traffic-tiles'))return req.fulfill({status:204});
  if(key==='vehicle-state')return req.fulfill({json:{data:trains(Date.now()),routes}});
  return req.fulfill({json:key==='config'?{tomtom:false,weather:false,fuel:false,rivers:false}:{version:1,data:[],routes:{}}});});
 await page.goto(`${base}/?mode=transport&lat=51.4591&lng=-0.9728&zoom=17.8&pitch=58`);await page.locator('#loading').waitFor({state:'hidden'});
 await expect.poll(()=>page.evaluate(()=>window.readingTools.reading_get_map_state({}).rendering.trainInstances),{timeout:30000}).toBe(8+3);
 if(process.env.SCREENSHOT_DIR){await mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await page.waitForTimeout(1500);await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/reading-station.png`});}
 if(errors.length)throw Error(`page errors: ${errors.join('; ')}`);
 console.log('reading station trains browser test passed');
}finally{await browser.close();}
