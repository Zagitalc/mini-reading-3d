import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
// Trains are drawn as linked cars: the Darwin length when known, otherwise three, and a single body where no railway section is known.
const base=process.env.APP_URL??'http://127.0.0.1:8790';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
// Reading to Reading West along the real railway, the same route the server builds for a train between those stations.
const route_=[[-0.972357,51.459023],[-0.972892,51.459073],[-0.9743,51.459231],[-0.976314,51.459506],[-0.978221,51.459748],[-0.979773,51.459879],[-0.981207,51.459811],[-0.982786,51.459567],[-0.984254,51.459225],[-0.985623,51.45879]];
let feed=[];
const train=(id,at,position,extra={})=>({id:`darwin:${id}`,kind:'train',position,observedAt:new Date(at).toISOString(),label:'GWR',status:'estimated',source:'test',tripId:id,bearing:270,speed:25,...extra});
try{
 const page=await browser.newPage({viewport:{width:1300,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.readingTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.readingTools[t.name]=t.execute;}}});});
 await page.route('**/api/v1/**',req=>{const key=new URL(req.request().url()).pathname.slice(8);
  if(key.startsWith('traffic-tiles'))return req.fulfill({status:204});
  if(key==='vehicle-state')return req.fulfill({json:{data:feed,routes:{eight:route_,unknown:route_,single:route_}}});
  return req.fulfill({json:key==='config'?{tomtom:false,weather:false,fuel:false,rivers:false}:{version:1,data:[],routes:{}}});});
 await page.goto(`${base}/?mode=transport&lat=51.4596&lng=-0.9772&zoom=17.6&pitch=60`);await page.locator('#loading').waitFor({state:'hidden'});
 const instances=()=>page.evaluate(()=>window.readingTools.reading_get_map_state({}).rendering.trainInstances);
 const publish=async trains=>{feed=trains;await page.evaluate(()=>document.dispatchEvent(new Event('reading-vehicles-needed')));};
 const now=Date.now();
 // 8 cars (Darwin length), 3 (length unknown) and one with no known railway section, which stays a single body.
 await publish([train('eight',now,route_[3],{cars:8}),train('unknown',now,route_[6]),train('single',now,[-0.9745,51.4572],{tripId:undefined})]);
 await expect.poll(instances,{timeout:20000}).toBe(12);
 // A newer report of the same train with a shorter formation redraws it; the other trains stay until their reports go stale.
 await publish([train('eight',now+1000,route_[3],{cars:4})]);
 await expect.poll(instances,{timeout:20000}).toBe(4+3+1);
 await publish([train('eight',now+2000,route_[3],{cars:8})]);
 await expect.poll(instances,{timeout:20000}).toBe(8+3+1);
 if(process.env.SCREENSHOT_DIR){await mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await page.waitForTimeout(1500);await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/train-cars.png`});}
 if(errors.length)throw Error(`page errors: ${errors.join('; ')}`);
 console.log('train cars browser test passed');
}finally{await browser.close();}
