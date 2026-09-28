import {chromium,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
// Serves the real stop timetable with one journey marked as tracked, and a mocked live bus five minutes from the stop.
const url=process.env.APP_URL??'http://127.0.0.1:8790';
const index=JSON.parse(await readFile('public/data/bus-stops.json','utf8'));
const stop=index.stops.find(s=>s.id==='039028150004');
const timetable=JSON.parse(await readFile(`public${stop.timetableUrl}`,'utf8'));
const serviceDate=`${index.validFrom.slice(0,4)}-${index.validFrom.slice(4,6)}-${index.validFrom.slice(6,8)}`;
const clockAt=new Date(`${serviceDate}T12:00:00Z`);
// Pick the first departure at least ten minutes after the fixed clock and track that journey.
const {scheduledDepartures}=await import('../shared/timetable.ts');
const upcoming=scheduledDepartures(timetable,clockAt.getTime(),3,40);
const departure=upcoming.find(d=>d.time>=clockAt.getTime()+10*60000);
if(!departure)throw Error('No departure to track');
const {serviceOrigin}=await import('../shared/timetable.ts');
const seconds=(departure.time-serviceOrigin(departure.serviceDate))/1000;
// A straight 2 km approach ending at the stop; the bus is half way, two minutes behind the timetable.
const end=stop.position,start=[end[0]-0.028,end[1]],mid=[(start[0]+end[0])/2,end[1]];
const journeys={schema:1,version:'fixture',routeId:departure.routeId,timezone:'Europe/London',shapes:[[start,end]],patterns:[{shape:0,stops:['approach',stop.id],sequences:[departure.sequence-1,departure.sequence],along:[0,1940]}],trips:[[departure.tripId,0,[seconds-600,seconds]]]};
const now=departure.time-5*60000+2*60000;// at the midpoint, scheduled five minutes before the stop, two minutes late
const label=index.routes[departure.routeId].label;
const bus={id:'bods:RBUS:YN14MYC',kind:'bus',position:mid,observedAt:new Date(now).toISOString(),operatorId:'RBUS',label,status:'observed',source:'Bus Open Data Service',timetableTripId:departure.tripId};
const stops={...index,routes:{...index.routes,[departure.routeId]:{...index.routes[departure.routeId],journeysUrl:'/data/timetables/fixture/journeys.json'}}};
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date(now));
  await page.route('**/data/bus-stops.json',r=>r.fulfill({json:stops}));
  await page.route('**/data/timetables/fixture/journeys.json',r=>r.fulfill({json:journeys}));
  await page.route('**/api/**',r=>{const u=r.request().url();r.fulfill({json:u.includes('/config')?{tomtom:false,weather:false,fuel:false}:u.includes('vehicle-state')?{version:1,data:[bus],routes:{}}:{version:1,data:[],routes:{}}});});
  await page.goto(url);await page.locator('#loading').waitFor({state:'hidden'});await expect(page.locator('#bus-stops-toggle')).toBeEnabled({timeout:60000});
  if(name==='mobile')await page.locator('#collapse-layers').click();
  await page.locator('.stop-control summary').click();await page.getByRole('searchbox',{name:'Find a bus stop'}).fill(stop.id);await page.getByRole('button',{name:`${stop.name} · ${stop.code}`,exact:true}).click();
  const live=page.locator('.live-departures');
  await expect(live.locator('.departures.live li')).toHaveCount(1);
  await expect(live.locator('.countdown')).toHaveText('5 min');
  await expect(live).toContainText('2 min late');await expect(live).toContainText(`${label}`);await expect(live).toContainText('not an operator prediction');
  // The scheduled list keeps its scheduled time and only flags the estimate beside it.
  await expect(page.locator('#stop-departures > ol.departures .live-flag')).toHaveCount(1);
  await expect(page.locator('#stop-departures')).toContainText('Scheduled times, not live predictions');
  await mkdir('test-results',{recursive:true});await page.screenshot({path:`test-results/live-departures-${name}.png`});
  // Without live positions the section says so, and every time is scheduled only.
  await page.unroute('**/api/**');await page.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('/config')?{tomtom:false,weather:false,fuel:false}:{version:1,data:[],routes:{}}}));
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('reading-vehicles',{detail:{vehicles:[],at:Date.now()}})));
  await expect(live).toContainText('No live bus positions');await expect(page.locator('.live-flag')).toHaveCount(0);
  if(errors.length)throw Error(errors.join('\n'));
  await page.close();
 }
 console.log(`Live departures: estimate, countdown, separate scheduled list and no-data fallback passed at ${stop.name} for route ${label}.`);
}finally{await browser.close();}
