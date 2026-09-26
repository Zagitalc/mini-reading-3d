import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';

const url=process.env.APP_URL??'http://127.0.0.1:8790';
const stop=(id,name,timed=true)=>({id,name,code:id,position:[-.971,51.456],routeIds:['fixture:17'],...(timed?{timetableUrl:`/data/timetables/tonight-fixture/${id}.json`}:{})});
const stops=[stop('night','Night audit stop'),stop('empty','Empty audit stop'),stop('missing','Untimed audit stop',false),stop('retry','Retry audit stop')];
const index={schema:1,version:'tonight-fixture',source:'Reading Buses test fixture',sourceUrl:'https://www.reading-buses.co.uk/',licence:'Test fixture',retrievedAt:'2026-09-26T12:00:00Z',generatedAt:'2026-09-26T12:00:00Z',timezone:'Europe/London',validFrom:'20260926',validUntil:'20260928',routes:{'fixture:17':{label:'17',colour:'#775599'}},stops,omitted:{missingTimes:0,frequencyTrips:0}};
// One service date deliberately crosses midnight. The last two trips are outside
// the exclusive 04:00 cutoff, and 32 eligible trips exercise pagination.
const seconds=[...Array.from({length:31},(_,i)=>23*3600+35*60+i*8*60),27*3600+45*60,28*3600,28*3600+15*60];
const timetable=id=>({schema:1,stopId:id,timezone:'Europe/London',services:[{start:'20260926',end:'20260926',weekdays:'1111111',exceptions:{}}],trips:seconds.map((_,i)=>({id:`trip-${i}`,service:0,routeId:'fixture:17',headsign:i===32?'At cutoff':i===33?'After cutoff':'Fixture destination',direction:'0'})),times:id==='empty'?[]:seconds.map((s,i)=>[i,s,i+1,i===5?1:0,i===5?2:0])});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report=[];

async function boot(viewport,partial=false){
 const page=await browser.newPage({viewport}),errors=[],requests=[];let retryAttempts=0;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',request=>{if(request.url().includes('/data/timetables/'))requests.push(request.url());});
 await page.clock.setFixedTime(new Date('2026-09-26T22:30:00Z')); // 23:30 BST
 await page.route('**/api/**',route=>route.fulfill({json:route.request().url().includes('/config')?{tomtom:false,weather:false,fuel:false}:{version:1,data:[],routes:{}}}));
 await page.route('**/data/bus-stops.json',route=>route.fulfill({json:{...index,...(partial?{validUntil:'20260926'}:{})}}));
 await page.route('**/data/timetables/tonight-fixture/*.json',route=>{
  const id=new URL(route.request().url()).pathname.split('/').at(-1).replace('.json','');
  if(id==='retry'&&retryAttempts++===0)return route.fulfill({status:503,body:'Fixture unavailable'});
  return route.fulfill({json:timetable(id)});
 });
 await page.goto(url);await page.locator('#loading').waitFor({state:'hidden'});await expect(page.locator('#bus-stops-toggle')).toBeEnabled();
 if(viewport.width<600)await page.locator('#collapse-layers').click();
 await page.locator('.stop-control summary').click();
 const select=async id=>{
  if(await page.locator('#details').isVisible())await page.locator('#close-details').click();
  const selected=stops.find(s=>s.id===id);
  await page.getByRole('searchbox',{name:'Find a bus stop'}).fill(selected.name);
  await page.getByRole('button',{name:`${selected.name} · ${selected.code}`,exact:true}).click();
  await expect(page.locator('#details h2')).toHaveText(selected.name);
 };
 return {page,errors,requests,select};
}

try{
 await mkdir('test-results',{recursive:true});
 for(const [label,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  const {page,errors,requests,select}=await boot({width,height});
  const board=page.locator('#stop-departures'),rows=board.locator('.departures li');
  await select('night');await expect(rows).toHaveCount(12);
  await expect(page.getByRole('button',{name:'Next departures',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Tonight / overnight',exact:true}).click();
  await expect(rows).toHaveCount(30);await expect(board).toContainText('Showing 30 of 32 departures in this window');
  await expect(board.locator('.departure-window')).toContainText(/From 23:30 Sat,? 26 Sept until 04:00 Sun,? 27 Sept · London time/);
  await expect(board).toContainText('Scheduled times, not live predictions');
  await expect(board).toContainText('cutoff is a viewing window, not the last bus');
  const approximate=rows.filter({hasText:'Approximate timetable time'});
  await expect(approximate).toHaveCount(1);await expect(approximate).toContainText('00:15');
  await expect(approximate).toContainText('Tomorrow');await expect(approximate).toContainText('Service date 26/09/2026');
  await expect(approximate).toContainText('Arrange pickup by phone');
  await page.getByRole('button',{name:'Show more departures',exact:true}).click();
  await expect(rows).toHaveCount(32);await expect(board).toContainText('Showing 32 of 32 departures in this window');
  await expect(rows.last()).toContainText('03:45');await expect(board).not.toContainText('At cutoff');await expect(board).not.toContainText('After cutoff');
  await expect(page.getByRole('button',{name:'Show more departures',exact:true})).toHaveCount(0);
  await page.screenshot({path:`test-results/tonight-stops-${label}-tail.png`});
  await page.locator('#details h2').scrollIntoViewIfNeeded();
  await page.screenshot({path:`test-results/tonight-stops-${label}.png`});
  await page.getByRole('button',{name:'Next departures',exact:true}).click();await expect(rows).toHaveCount(12);
  await page.getByRole('button',{name:'Tonight / overnight',exact:true}).click();await expect(rows).toHaveCount(30);
  await select('night');await expect(rows).toHaveCount(30);assert.equal(requests.length,1,'Mode changes and repeated selection reuse the same timetable');

  await page.clock.setFixedTime(new Date('2026-09-26T23:30:00Z')); // 00:30 BST, same night
  await select('night');await expect(rows).toHaveCount(25);
  await expect(board.locator('.departure-window')).toContainText(/From 00:30 Sun,? 27 Sept until 04:00 Sun,? 27 Sept/);
  await expect(rows.first()).toContainText('00:31');await expect(rows.last()).toContainText('03:45');await expect(board).not.toContainText('Tomorrow');
  assert.equal(requests.length,1,'Clock changes do not fetch the timetable again');

  await select('empty');await expect(board).toContainText('No scheduled departures in this window in this snapshot');await expect(rows).toHaveCount(0);
  await select('missing');await expect(board).toContainText('No timed departures supplied for this stop');await expect(rows).toHaveCount(0);
  await select('retry');await expect(board).toContainText('This stop’s timetable could not load');await expect(rows).toHaveCount(0);
  await select('retry');await expect(rows).toHaveCount(25);
  assert.equal(requests.filter(value=>value.endsWith('/retry.json')).length,2,'A failed timetable request can be retried');
  assert.equal(requests.filter(value=>value.endsWith('/missing.json')).length,0,'An untimed stop does not fetch a timetable');

  await page.clock.setFixedTime(new Date('2026-09-29T22:30:00Z'));await select('night');
  await expect(board).toContainText('snapshot has expired');await expect(board).toContainText('Current scheduled departures are unavailable');await expect(rows).toHaveCount(0);
  await page.clock.setFixedTime(new Date('2026-09-25T22:30:00Z'));await select('night');
  await expect(board).toContainText('has not started yet');await expect(rows).toHaveCount(0);
  assert.deepEqual(errors,[]);report.push({label,windowDepartures:32,beforeFourDepartures:25,timetableRequests:requests.length,pagination:true,empty:true,missing:true,retry:true,expired:true,future:true});
  await page.close();
 }
 const {page,errors,select}=await boot({width:1440,height:1000},true);
 await select('night');await page.getByRole('button',{name:'Tonight / overnight',exact:true}).click();
 await expect(page.locator('#stop-departures')).toContainText('Timetable coverage ends during this window');
 await expect(page.locator('#stop-departures')).toContainText('list may be incomplete');
 await expect(page.locator('#stop-departures')).toContainText('Showing 30 of 32');
 await select('empty');await expect(page.locator('#stop-departures')).toContainText('The timetable cannot confirm the rest');
 assert.deepEqual(errors,[]);report.push({partialCoverage:true,partialEmpty:true});await page.close();
 await writeFile('test-results/tonight-stops-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
