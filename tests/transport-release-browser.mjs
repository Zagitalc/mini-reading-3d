import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
// Checks the last-departures view and the Reading station board. The rail API is stubbed so the
// board's rendering (delays, cancellations, platforms, staleness) is checked without provider calls.
const url=process.env.APP_URL??'http://127.0.0.1:8790';
const stopId=process.env.STOP_ID??'039026610001';
const now=new Date(process.env.FIXED_TIME??'2026-09-27T17:30:00Z');
const board=(generatedAt)=>({version:1,configured:true,board:{schema:1,station:'RDG',name:'Reading',generatedAt,messages:['Disruption between Twyford and Maidenhead.'],source:'National Rail Darwin via Rail Data Marketplace',sourceUrl:'https://www.nationalrail.co.uk/developers/darwin-data-feeds/',services:[
 {id:'a',scheduled:'18:40',expected:'On time',destination:'London Paddington',platform:'9',operator:'GWR',cancelled:false},
 {id:'b',scheduled:'18:42',expected:'18:49',destination:'Manchester Piccadilly',via:'via Birmingham',operator:'CrossCountry',cancelled:false,reason:'This train has been delayed by a signalling fault'},
 {id:'c',scheduled:'18:45',expected:'Cancelled',destination:'London Waterloo',operator:'South Western Railway',cancelled:true,reason:'This train has been cancelled because of a shortage of train crew'}]}});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report=[];
try{
 for(const [label,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];let boardRequests=0,generatedAt=now.toISOString();
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(now);
  await page.route('**/api/**',r=>{const u=r.request().url();if(u.includes('/rail-board')){boardRequests++;return r.fulfill({json:board(generatedAt)});}return r.fulfill({json:u.includes('/config')?{tomtom:false,weather:false,fuel:false}:{version:1,data:[],routes:{}}});});
  await page.goto(url);await page.locator('#loading').waitFor({state:'hidden'});await expect(page.locator('#bus-stops-toggle')).toBeEnabled({timeout:60000});
  if(label==='mobile')await page.locator('#collapse-layers').click();
  await page.locator('.stop-control summary').click();await page.getByRole('searchbox',{name:'Find a bus stop'}).fill(stopId);await page.locator('.stop-results button').first().click();
  await page.getByRole('button',{name:'Last departures'}).click();
  await expect(page.locator('.last-departures li').first()).toBeVisible();
  await expect(page.locator('#stop-departures')).toContainText('Times after midnight still belong to this service date');
  const rows=await page.locator('.last-departures li').allInnerTexts();
  const options=await page.locator('.service-date-picker option').allInnerTexts();
  await page.locator('.service-date-picker select').selectOption({index:1});await expect(page.locator('.service-date-picker select')).toHaveValue(/\d{8}/);
  const nextDayRows=await page.locator('.last-departures li').count();
  await mkdir('test-results',{recursive:true});await page.screenshot({path:`test-results/last-departures-${label}.png`});
  await page.locator('#close-details').click();
  // Since 29 September a phone closes the layers sheet itself when a card opens; only close it if it is still open.
  if(label==='mobile'&&await page.locator('.explore-panel.mobile-open').count())await page.locator('#collapse-layers').click();
  await page.getByRole('button',{name:'↗ Station'}).click();await page.waitForTimeout(2500);
  await page.locator('.landmark-pin[aria-label="Reading station"]').click();
  await expect(page.locator('#details h2')).toHaveText('Reading station');
  await expect(page.locator('.rail-board li')).toHaveCount(3);
  await expect(page.locator('.rail-board')).toContainText('Expected 18:49');await expect(page.locator('.rail-board')).toContainText('Cancelled');await expect(page.locator('.rail-board')).toContainText('Plat. 9');
  await expect(page.locator('#station-board .schedule-notice')).toHaveCount(0);
  await page.screenshot({path:`test-results/station-board-${label}.png`});
  generatedAt=new Date(now.getTime()-10*60000).toISOString();await page.locator('#close-details').click();await page.locator('.landmark-pin[aria-label="Reading station"]').click({force:true});
  await expect(page.locator('#station-board .schedule-notice')).toContainText('has not refreshed since');
  if(errors.length)throw Error(errors.join('\n'));
  report.push({label,lastDepartureRows:rows.length,firstRow:rows[0].replace(/\n+/g,' | '),serviceDates:options,nextDayRows,boardRequests});await page.close();
 }
 await writeFile('test-results/transport-release-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,1));
}finally{await browser.close();}
