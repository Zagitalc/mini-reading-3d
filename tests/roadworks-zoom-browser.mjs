import {chromium,expect} from '@playwright/test';
// Roadwork pins: closures are pinned at every zoom, ordinary works only once the map is zoomed in far enough
// (LAYER_ZOOM.roadworksAllKinds), so the town-wide view is not crowded with small works.
const {LAYER_ZOOM}=await import('../shared/layer-zoom.ts');
const base=process.env.APP_URL??'http://127.0.0.1:8790';
const event=(id,kind,lng)=>({id,title:`${kind} ${id}`,description:'Test event',organisation:'Test',geometry:{type:'Point',coordinates:[lng,51.4545]},kind,status:'active',version:1,source:'test',observedAt:new Date().toISOString(),plannedStart:'2026-10-01',plannedEnd:'2026-12-01'});
const events=[event('c1','closure',-0.9712),event('w1','works',-0.9702)];
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1300,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',route=>{const key=new URL(route.request().url()).pathname.slice(8);
  if(key.startsWith('traffic-tiles'))return route.fulfill({status:204});
  return route.fulfill({json:key==='config'?{tomtom:false,weather:false,fuel:false,rivers:false}:key==='road-events'?{version:1,data:events}:{version:1,data:[],routes:{}}});});
 // The road-events request starts a few seconds after the map appears on a slow machine, so wait for it, then give the pins their time.
 const zoomTo=async z=>{const sent=page.waitForResponse('**/api/v1/road-events',{timeout:60000});await page.goto(`${base}/?mode=transport&lat=51.4545&lng=-0.9707&zoom=${z}`);await page.locator('#loading').waitFor({state:'hidden'});await sent;await page.waitForTimeout(1000);};
 const slow={timeout:15000};
 const wide=LAYER_ZOOM.roadworksAllKinds-1,near=LAYER_ZOOM.roadworksAllKinds+1;
 await zoomTo(wide);
 await expect(page.locator('.event-pin.closure')).toHaveCount(1,slow);
 await expect(page.locator('.event-pin.works')).toHaveCount(0,slow);
 await zoomTo(near);
 await expect(page.locator('.event-pin.closure')).toHaveCount(1,slow);
 await expect(page.locator('.event-pin.works')).toHaveCount(1,slow);
 if(errors.length)throw Error(errors.join('\n'));
 console.log(`Roadwork pins: closures at zoom ${wide}, closures and works at zoom ${near} passed.`);
}finally{await browser.close();}
