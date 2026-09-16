import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const url=process.env.APP_URL??'http://127.0.0.1:8790';
const index=JSON.parse(await readFile('public/data/bus-stops.json','utf8'));
const stop=index.stops.find(s=>s.id==='039028150004');
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report=[];
try{
 for(const [label,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/data/timetables/'))requests.push(r.url());});
  await page.clock.setFixedTime(new Date('2026-09-16T09:00:00Z'));
  await page.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('/config')?{tomtom:false,weather:false,fuel:false}:{version:1,data:[],routes:{}}}));
  await page.goto(url);await page.locator('#loading').waitFor({state:'hidden'});await expect(page.locator('#bus-stops-toggle')).toBeEnabled();
  if(label==='mobile')await page.locator('#collapse-layers').click();
  await page.locator('.stop-control summary').click();await page.getByRole('searchbox',{name:'Find a bus stop'}).fill(stop.id);await page.getByRole('button',{name:`${stop.name} · ${stop.code}`,exact:true}).click();
  await expect(page.locator('#details h2')).toHaveText(stop.name);await expect(page.locator('#stop-departures .departures li').first()).toBeVisible();await expect(page.locator('#stop-departures')).toContainText('Scheduled times, not live predictions');await expect(page.locator('#details-content')).toContainText('07/09/2026–18/09/2026');
  const count=await page.locator('.departures li').count();if(count!==12)throw Error(`Expected 12 departures; got ${count}`);
  await page.locator('#close-details').click();
  if(label==='desktop'){
   await page.waitForTimeout(1800);await page.mouse.click(width/2,height/2);await expect(page.locator('#details h2')).toHaveText(stop.name);await expect(page.locator('#details')).toBeVisible();await expect(page.locator('.departures li').first()).toBeVisible();
  }else await page.getByRole('button',{name:`${stop.name} · ${stop.code}`,exact:true}).click();
  if(requests.length!==1)throw Error(`Timetable fetched ${requests.length} times for repeat selection`);
  await mkdir('test-results',{recursive:true});await page.screenshot({path:`test-results/stops-${label}.png`});
  await page.locator('#close-details').click();await page.clock.setFixedTime(new Date('2026-09-20T12:00:00Z'));await page.getByRole('button',{name:`${stop.name} · ${stop.code}`,exact:true}).click();await expect(page.locator('#stop-departures')).toContainText('snapshot has expired');await expect(page.locator('.departures li')).toHaveCount(0);
  await page.locator('#close-details').click();await page.clock.setFixedTime(new Date('2026-09-01T12:00:00Z'));await page.getByRole('button',{name:`${stop.name} · ${stop.code}`,exact:true}).click();await expect(page.locator('#stop-departures')).toContainText('has not started yet');await expect(page.locator('.departures li')).toHaveCount(0);
  if(errors.length)throw Error(errors.join('\n'));report.push({label,departures:count,timetableRequests:requests.length,expired:true,future:true});await page.close();
 }
 await writeFile('test-results/stops-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
