import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.APP_URL??'http://127.0.0.1:8790';
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],counts={};
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.readingTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.readingTools[t.name]=t.execute;}}});Object.defineProperty(document,'hidden',{get:()=>!!window.testHidden});});
 const tileIndex=geojsonvt({type:'FeatureCollection',features:[{type:'Feature',properties:{relative_speed:.3},geometry:{type:'LineString',coordinates:[[-.978,51.456],[-.967,51.456]]}}]});
 await page.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;counts[path]=(counts[path]??0)+1;const now=new Date().toISOString();let body;
  if(path.endsWith('/config'))body={tomtom:true,weather:true,fuel:true};
  else if(path.includes('/traffic-tiles/')){const [z,x,y]=path.split('/').slice(-3).map(Number),tile=tileIndex.getTile(z,x,y);return route.fulfill({contentType:'application/vnd.mapbox-vector-tile',body:Buffer.from(vtpbf.fromGeojsonVt({'Traffic flow':tile??{features:[]}}))});}
  else if(path.endsWith('/vehicle-state'))body={data:[{id:'fixture:bus',kind:'bus',label:'17',position:[-.972,51.457],bearing:90,observedAt:now,source:'Browser test fixture',status:'observed',routeGroupId:'RBUS:17',routeColour:'#784699'}],routes:{}};
  else if(path.endsWith('/health'))body={data:[{id:'buses',label:'Buses',state:'live',count:1,intervalMs:60000,message:'Fixture',lastSuccess:now},{id:'traffic',state:'connecting',message:'Tiles load on demand',count:0}]};
  else if(path.endsWith('/road-events'))return route.fulfill({status:503,body:'{}'});
  else if(path.endsWith('/weather'))body={data:[{id:'reading',temperature:15,cloudCover:70,rainMm:.3,snowCm:0,intervalSeconds:900,code:61,windKph:12,windDirection:200,isDay:true,observedAt:now,source:'Weather fixture'}]};
  else if(path.endsWith('/fuel'))body={data:[{id:'fixture:fuel',name:'Test forecourt',brand:'Fixture',position:[-.969,51.457],postcode:'RG1',quiet:false,prices:{E10:{pence:140.9,submittedAt:now}},observedAt:now,source:'Fuel fixture'}]};
  else body={data:[]};return route.fulfill({json:body});
 });
 await page.clock.install();await page.goto(base);await page.locator('#loading').waitFor({state:'hidden'});await expect(page.locator('#weather-summary')).toContainText('15°C');await expect(page.locator('#fuel-summary')).toContainText('1 forecourts');
 await expect.poll(()=>page.evaluate(()=>window.readingTools.reading_get_map_state({}).rendering.busInstances)).toBe(1);
 await page.locator('[data-route-layer=bus]').check();await page.getByLabel('Bus routes selector',{exact:true}).selectOption('RBUS:17');
 await expect.poll(()=>page.evaluate(()=>window.readingTools.reading_get_map_state({}).rendering.busInstances)).toBe(1);
 await page.getByLabel('Bus routes selector',{exact:true}).selectOption('RBUS:5');await expect.poll(()=>page.evaluate(()=>window.readingTools.reading_get_map_state({}).rendering.busInstances)).toBe(0);
 await page.locator('[data-route-layer=bus]').uncheck();await page.locator('#close-details').click();
 await expect.poll(()=>page.evaluate(()=>window.readingTools.reading_get_map_state({}).rendering.busInstances)).toBe(1);
 await page.locator('#fuel-layer').check();await page.locator('#weather-summary').click();await expect(page.getByRole('heading',{name:'15.0°C'})).toBeVisible();await page.locator('#close-details').click();
 await page.waitForTimeout(800);await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/environment-rain-desktop.png'});
 // Advance timers without waiting a real minute; slow feeds must not refresh.
 const before={...counts};await page.clock.fastForward(61000);await page.waitForTimeout(100);
 if(counts['/api/v1/vehicle-state']!==before['/api/v1/vehicle-state']+1)throw Error('Vehicle cadence incorrect');
 for(const name of ['road-events','weather','fuel'])if(counts['/api/v1/'+name]!==before['/api/v1/'+name])throw Error(name+' called too often');
 await page.evaluate(()=>{window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));});const hidden={...counts};await page.clock.fastForward(16*60000);await page.waitForTimeout(100);if(JSON.stringify(counts)!==JSON.stringify(hidden))throw Error('Hidden page made feed requests');
 await page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(200);
 await page.locator('#weather-effects').uncheck();await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/environment-mobile.png'});
 if(errors.length)throw Error(errors.join('\n'));await writeFile('test-results/environment-calls.json',JSON.stringify({before,after:counts},null,2));console.log('Browser: rain/clouds, vector traffic, visible bus despite roadworks failure, route filtering, fuel controls, slow-feed cadence and hidden-tab pause passed.');
}finally{await browser.close();}
