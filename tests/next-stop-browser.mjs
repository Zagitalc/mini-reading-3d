import {chromium,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
// Vehicle cards: a bus matched to a journey shows its next stop, and a train shows its next Darwin call.
// Each vehicle is mocked at the map's starting centre, so a click there opens its card.
const url=process.env.APP_URL??'http://127.0.0.1:8790';
const index=JSON.parse(await readFile('public/data/bus-stops.json','utf8'));
const {ORIGIN}=await import('../shared/config.ts');
const {serviceOrigin,localDate}=await import('../shared/timetable.ts');
const stop=index.stops.find(s=>s.id==='039028150004'),routeId=stop.routeIds[0],label=index.routes[routeId].label;
// A straight road through the centre; the bus is half way along at 12:07, where the timetable has it at 12:05.
const start=[ORIGIN[0]-0.01,ORIGIN[1]],end=[ORIGIN[0]+0.01,ORIGIN[1]],serviceDate=localDate(Date.parse(`${index.validFrom.slice(0,4)}-${index.validFrom.slice(4,6)}-${index.validFrom.slice(6,8)}T12:00:00Z`));
const origin=serviceOrigin(serviceDate),now=origin+(12*3600+7*60)*1000;
const journeys={schema:1,version:'fixture',routeId,timezone:'Europe/London',shapes:[[start,end]],patterns:[{shape:0,stops:['approach',stop.id],sequences:[1,2],along:[0,1390]}],trips:[['FIXTURE-TRIP',0,[12*3600,12*3600+10*60]]]};
const stops={...index,routes:{...index.routes,[routeId]:{...index.routes[routeId],journeysUrl:'/data/timetables/fixture/next-stop.json'}}};
const bus={id:'bods:RBUS:YN14MYC',kind:'bus',position:ORIGIN,observedAt:new Date(now).toISOString(),operatorId:'RBUS',label,status:'observed',source:'Bus Open Data Service',timetableTripId:'FIXTURE-TRIP'};
const clock=t=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}).format(t);
const train={id:'darwin:fixture',kind:'train',position:ORIGIN,observedAt:new Date(now).toISOString(),status:'estimated',tripId:'fixture',label:'Great Western Railway',destination:'London Paddington',
 nextStop:{name:'Twyford',at:new Date(now+6*60000).toISOString(),scheduled:clock(now+4*60000),platform:'3'},source:'National Rail Darwin'};
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
async function card(vehicle,name){
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date(now));
 await page.route('**/data/bus-stops.json',r=>r.fulfill({json:stops}));
 await page.route('**/data/timetables/fixture/next-stop.json',r=>r.fulfill({json:journeys}));
 await page.route('**/api/**',r=>{const u=r.request().url();r.fulfill({json:u.includes('/config')?{tomtom:false,weather:false,fuel:false}:u.includes('vehicle-state')?{version:1,data:[vehicle],routes:{}}:{version:1,data:[],routes:{}}});});
 await page.goto(url);await page.locator('#loading').waitFor({state:'hidden'});await expect(page.locator('#bus-stops-toggle')).toBeEnabled({timeout:60000});await page.waitForTimeout(1500);
 const box=await page.locator('#map').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await expect(page.locator('#details .pill')).toContainText(vehicle.kind==='bus'?'Bus':'Train');
 return {page,errors,done:async()=>{await mkdir('test-results',{recursive:true});await page.screenshot({path:`test-results/next-stop-${name}.png`});if(errors.length)throw Error(errors.join('\n'));await page.close();}};
}
try{
 {const {page,done}=await card(bus,'bus'),details=page.locator('#details');
  await expect(details).toContainText('Next stop');await expect(details).toContainText(stop.name);await expect(details).toContainText(`Stop ${stop.code}`);
  await expect(details).toContainText(`Due about ${clock(origin+(12*3600+12*60)*1000)} · 2 min late`);await expect(details).toContainText('last stop on the map');
  await done();}
 // A bus whose journey is not in the timetable says so instead of guessing.
 {const {page,done}=await card({...bus,timetableTripId:'NOT-IN-TIMETABLE'},'bus-unknown');
  await expect(page.locator('#vehicle-next-stop')).toContainText('Not known');await done();}
 {const {page,done}=await card(train,'train'),details=page.locator('#details');
  await expect(details).toContainText('Next stop');await expect(details).toContainText('Twyford');
  await expect(details).toContainText(`Expected ${clock(now+6*60000)} · scheduled ${clock(now+4*60000)} · platform 3`);await done();}
 {const {page,done}=await card({...train,nextStop:{name:'Reading',at:new Date(now+2*60000).toISOString(),scheduled:clock(now+2*60000),platform:'9',dwell:true}},'train-dwell');
  await expect(page.locator('#details')).toContainText('Now at');await expect(page.locator('#details')).toContainText(`Departs ${clock(now+2*60000)} · platform 9`);await done();}
 console.log(`Next stop: bus (${label} to ${stop.name}), unknown journey, moving train and standing train passed.`);
}finally{await browser.close();}
