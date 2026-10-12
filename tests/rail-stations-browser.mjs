import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
// Pins for the stations around Reading: shown with the Trains layer from zoom 12.5, only for stations in view, each opening its own departures.
const base=process.env.APP_URL??'http://127.0.0.1:8790';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const board=crs=>({version:1,configured:true,board:{schema:1,station:crs,name:crs==='TLH'?'Tilehurst':crs,generatedAt:new Date().toISOString(),messages:[],source:'test',sourceUrl:'https://example.org',
 services:[{id:'a',scheduled:'18:10',expected:'On time',destination:'London Paddington',platform:'2',operator:'GWR',cancelled:false},{id:'b',scheduled:'18:40',expected:'18:44',destination:'Reading',operator:'GWR',cancelled:false}]}});
try{
 for(const [name,viewport] of [['desktop',{width:1300,height:900}],['phone',{width:390,height:800}]]){
  const page=await browser.newPage({viewport}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/v1/**',req=>{const u=new URL(req.request().url()),key=u.pathname.slice(8);
   if(key.startsWith('traffic-tiles'))return req.fulfill({status:204});
   if(key==='rail-board'){requests.push(u.search);return req.fulfill({json:board(u.searchParams.get('station')??'RDG')});}
   return req.fulfill({json:key==='config'?{tomtom:false,weather:false,fuel:false,rivers:false}:{version:1,data:[],routes:{}}});});
  // Desktop: wide enough for Tilehurst, Reading West and Reading Green Park. Phone: Tilehurst only.
  await page.goto(`${base}/?mode=transport&${name==='desktop'?'lat=51.449&lng=-1.0&zoom=12.7':'lat=51.4717&lng=-1.0297&zoom=13.5'}`);await page.locator('#loading').waitFor({state:'hidden'});
  const pins=page.locator('.rail-station-pin');
  await expect(pins.first()).toBeVisible({timeout:20000});
  const names=await pins.locator('.pin-label').allTextContents();
  for(const expected of name==='desktop'?['Tilehurst','Reading West','Reading Green Park']:['Tilehurst'])if(!names.includes(expected))throw Error(`${name}: no pin for ${expected}: ${names}`);
  if(names.includes('Wokingham')||names.includes('Wargrave'))throw Error(`${name}: stations out of view have pins`);
  // The Trains layer switch hides them (checked below).
  await pins.filter({hasText:'Tilehurst'}).click();
  await expect(page.locator('#details')).toContainText('Tilehurst station',{timeout:10000});
  await expect(page.locator('.rail-board li')).toHaveCount(2);await expect(page.locator('.rail-board')).toContainText('London Paddington');
  if(!requests.includes('?station=TLH'))throw Error(`${name}: board not requested by station: ${requests}`);
  if(process.env.SCREENSHOT_DIR){await mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/rail-stations-${name}.png`});}
  await page.evaluate(()=>{const t=document.querySelector('[data-layer=trains]');t.checked=false;t.dispatchEvent(new Event('change'));});
  await expect(pins).toHaveCount(0);
  await page.evaluate(()=>{const t=document.querySelector('[data-layer=trains]');t.checked=true;t.dispatchEvent(new Event('change'));});
  await expect(pins.first()).toBeVisible();
  if(errors.length)throw Error(`${name}: page errors: ${errors.join('; ')}`);
 }
 console.log('railway station pins passed on desktop and phone.');
}finally{await browser.close();}
