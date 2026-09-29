import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const {applyMinute,summariseHour,fuelDay,hourKey}=await import('../shared/history.ts');

const url=process.env.APP_URL??'http://127.0.0.1:8790';
const now=Date.parse('2026-10-05T11:30:00Z');// 12:30 BST on Monday
// Four days of samples: buses only between 07:00 and 23:00 UTC (someone had the map open), trains all day,
// a delayed and a cancelled departure each evening, rivers down for an hour, and one fuel row a day.
const rows=new Map();
for(let t=now-4*86400000;t<=now;t+=15*60000){
 const h=new Date(t).getUTCHours(),clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(t+5*60000);
 const services=[{id:`s${t}`,scheduled:clock,expected:h===18&&t%(3600000)===0?'Delayed':'On time',destination:'London Paddington',operator:'GWR',cancelled:h===19&&t%3600000===0}];
 applyMinute(rows,{now:t,buses:h>=7&&h<23?{count:40+Math.round(40*Math.sin(Math.PI*(h-7)/16)),routes:20}:null,trains:{count:10},
  board:{schema:1,station:'RDG',name:'Reading',generatedAt:new Date(t).toISOString(),services,messages:[],source:'RDM',sourceUrl:'https://example.test'},
  feeds:[{id:'trains',state:'live'},{id:'weather',state:'live'},{id:'fuel',state:'live'},{id:'rivers',state:t>=now-29.5*3600000&&t<now-28.5*3600000?'unavailable':'live'}].map(f=>({...f,label:f.id,message:'',count:0,intervalMs:60000}))});
}
const fuel=[3,2,1,0].map((d,i)=>{const day=fuelDay([{id:'a',name:'A',brand:'A',postcode:'RG1',position:[-.97,51.45],quiet:false,source:'t',observedAt:new Date(now-d*86400000-3600000).toISOString(),prices:{E10:{pence:139.9+i,submittedAt:'2026-10-01T09:00:00Z'},B7S:{pence:149.9-i,submittedAt:'2026-10-01T09:00:00Z'}}},{id:'b',name:'B',brand:'B',postcode:'RG2',position:[-.96,51.45],quiet:false,source:'t',observedAt:new Date(now-d*86400000-3600000).toISOString(),prices:{E10:{pence:143.9+i,submittedAt:'2026-10-01T09:00:00Z'}}}],now-d*86400000);const {stations:_,...rest}=day;return rest;});
const history=days=>{const from=hourKey(now-days*86400000+3600000);return {version:1,generatedAt:new Date(now).toISOString(),from,recordingSince:[...rows.keys()].sort()[0],hours:[...rows.values()].filter(r=>r.hour>=from&&Date.parse(r.hour)<=now).sort((a,b)=>a.hour.localeCompare(b.hour)).map(summariseHour),fuel};};
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 for(const viewport of [{width:1400,height:950},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),errors=[],historyRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date(now));
  await page.route('**/api/**',route=>{const u=new URL(route.request().url());if(u.pathname==='/api/v1/history'){historyRequests.push(u.search);return route.fulfill({json:history(+u.searchParams.get('days'))});}
   return route.fulfill({json:u.pathname.includes('/config')?{tomtom:false,weather:false,fuel:false}:{version:1,data:[],routes:{}}});});
  await page.goto(url);await page.locator('#loading').waitFor({state:'hidden'});
  await page.locator('#tools-toggle').click();
  assert.equal(historyRequests.length,0,'history loads only when the view opens');
  await page.getByRole('button',{name:/Reading over time/}).click();
  await expect(page.locator('#details .pill')).toHaveText('Recorded history · hourly');
  await expect(page.locator('#history-view')).toContainText('Recording since Thu, 1 Oct');
  assert.deepEqual(historyRequests,['?days=7']);
  // 7 days of hourly slots; bars only where buses were sampled.
  const busBars=await page.locator('.history-chart.buses rect').count();assert.equal(busBars,4*16+1,'no bars for hours without bus samples');
  await expect(page.locator('.history-chart.rail .history-legend')).toHaveText(/On time.*5\+ min late.*Cancelled/);
  assert.equal(await page.locator('.history-chart.rail rect.cancelled').count(),4);assert.equal(await page.locator('.history-chart.rail rect.late').count(),4);
  assert.equal(await page.locator('.history-chart.feeds rect.down').count(),1,'the rivers outage hour');
  await expect(page.locator('.history-chart.fuel .direct')).toHaveText(['Petrol E10','Diesel']);
  await expect(page.locator('.history-table').first()).toContainText('Latest prices as of Mon, 5 Oct, 11:30');
  await page.locator('.history-details summary').click();await expect(page.locator('.history-details tbody tr')).toHaveCount(5);
  await page.locator('#details').evaluate(e=>e.scrollTop=0);await page.screenshot({path:`${process.env.SHOT_DIR??'.'}/history-${viewport.width}-top.png`});await page.locator('#details').evaluate(e=>e.scrollTop=e.scrollHeight);await page.screenshot({path:`${process.env.SHOT_DIR??'.'}/history-${viewport.width}.png`});
  await page.locator('[data-history-days="1"]').click();await expect(page.locator('[data-history-days="1"]')).toHaveAttribute('aria-pressed','true');
  assert.equal(await page.locator('.history-chart.buses rect').count(),16,'24 hours: buses from 12:00 to 22:00 yesterday and 07:00 to 11:00 today, UTC');
  const overflow=await page.locator('#details').evaluate(e=>e.scrollWidth-e.clientWidth);assert.ok(overflow<=1,`details panel must not scroll sideways (${overflow}px)`);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Reading over time: lazy load, gaps for unsampled hours, stacked departures, feed outage, fuel lines and table, range toggle and mobile width passed.');
}finally{await browser.close();}
