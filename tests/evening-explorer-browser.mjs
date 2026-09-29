import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';

const url=process.env.APP_URL??'http://127.0.0.1:8790';
const h=(hours,minutes=0)=>hours*3600+minutes*60;
const index=(servicesUrl)=>({schema:1,version:'explorer-fixture',source:'Reading Buses test fixture',sourceUrl:'https://www.reading-buses.co.uk/',licence:'Test fixture',retrievedAt:'2026-10-01T12:00:00Z',generatedAt:'2026-10-01T12:00:00Z',timezone:'Europe/London',validFrom:'20261001',validUntil:'20261031',
 routes:{'fixture:17':{label:'17',colour:'#775599'},'fixture:5':{label:'5',colour:'#4a8a5c'},'fixture:9':{label:'9',colour:'#b0583a'}},
 stops:[{id:'A',name:'Fixture Station',code:'A',position:[-.971,51.456],routeIds:['fixture:17','fixture:5','fixture:9']}],omitted:{missingTimes:0,frequencyTrips:0},...(servicesUrl?{servicesUrl}:{})});
// Friday 2 October only. Route 17 runs past midnight, route 5 finishes at 22:40, route 9 does not run.
const summary={schema:1,version:'explorer-fixture',timezone:'Europe/London',services:[{start:'20261002',end:'20261002',weekdays:'0000100',exceptions:{}},{start:'20261003',end:'20261003',weekdays:'0000010',exceptions:{}}],trips:[
 [0,'fixture:5','Whitley Wood','0',h(22),h(22,40),'A'],[0,'fixture:17','Wokingham Road','0',h(23,10),h(23,50),'A'],[0,'fixture:17','Tilehurst','1',h(24,20),h(25),'A'],[1,'fixture:9','Southcote','0',h(12),h(12,30),'A']]};
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});

async function boot(viewport,servicesUrl='/data/timetables/explorer-fixture/services.json'){
 const page=await browser.newPage({viewport}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',request=>{if(request.url().includes('/data/timetables/'))requests.push(request.url());});
 await page.clock.setFixedTime(new Date('2026-10-02T22:32:00Z')); // 23:32 BST on Friday
 await page.route('**/api/**',route=>route.fulfill({json:route.request().url().includes('/config')?{tomtom:false,weather:false,fuel:false}:{version:1,data:[],routes:{}}}));
 await page.route('**/data/bus-stops.json',route=>route.fulfill({json:index(servicesUrl)}));
 await page.route('**/data/timetables/explorer-fixture/services.json',route=>route.fulfill({json:summary}));
 await page.goto(url);await page.locator('#loading').waitFor({state:'hidden'});
 await page.locator('#tools-toggle').click();
 await expect(page.locator('.explorer-open')).toBeEnabled({timeout:30000});
 return {page,errors,requests};
}

for(const viewport of [{width:1400,height:950},{width:390,height:844}]){
 const {page,errors,requests}=await boot(viewport);
 assert.equal(requests.length,0,'the summary loads only when the explorer opens');
 await page.locator('.explorer-open').click();
 await expect(page.locator('#details .pill')).toHaveText('Scheduled view · not live');
 await expect(page.locator('#explorer-time')).toHaveValue('23:30');
 await expect(page.locator('.explorer-summary')).toContainText('At 23:30 on the night of Fri, 2 Oct, 1 bus is timetabled to be on the road across 1 route');
 await expect(page.locator('.explorer-routes').first()).toContainText('1 more journey starts before 04:00');
 await expect(page.locator('#details')).toContainText('Last journey started 22:00 from Fixture Station to Whitley Wood');
 await expect(page.locator('#details')).toContainText('No journeys on this night: 9.');
 await page.locator('[data-explorer-time="00:00"]').click();
 await expect(page.locator('.explorer-summary')).toContainText('At 00:00 on the night of Fri, 2 Oct, 0 buses');
 await expect(page.locator('#details')).toContainText('Next journey 00:20 from Fixture Station to Tilehurst');
 await page.locator('.night-profile rect[data-clock="23:15"]').click();
 await expect(page.locator('#explorer-time')).toHaveValue('23:15');
 await page.locator('#explorer-highlight').click();
 await expect(page.locator('#explorer-highlight')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-route-layer=bus]')).toBeChecked();
 await page.locator('#explorer-date').selectOption('20261003');
 await expect(page.locator('.explorer-summary')).toContainText('night of Sat, 3 Oct');
 await expect(page.locator('#explorer-highlight')).toHaveCount(0);
 const overflow=await page.locator('#details').evaluate(e=>e.scrollWidth>e.clientWidth);
 assert.equal(overflow,false,'no sideways scrolling in the panel');
 assert.equal(requests.length,1,'one summary request, reused across changes');
 assert.deepEqual(errors,[]);
 await page.close();
}
{
 const {page,errors}=await boot({width:1400,height:950},null);
 await expect(page.locator('.explorer-open small')).toHaveText('After next refresh');
 await page.locator('#tools-toggle').click();await page.locator('.explorer-open').click();
 await expect(page.locator('#service-explorer')).toContainText('available after the next timetable refresh');
 assert.deepEqual(errors,[]);await page.close();
}
await browser.close();
console.log('Evening timetable explorer browser checks passed');
