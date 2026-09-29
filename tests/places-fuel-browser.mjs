import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
// Fuel comparisons and the food hygiene layer against fixtures; run `npm run build` and `npm start` first.
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.APP_URL??'http://127.0.0.1:8787';
const hours=h=>new Date(Date.now()-h*3600000).toISOString();
const station=(id,name,brand,position,e10,submitted=2)=>({id,name,brand,position,postcode:'RG1',quiet:false,prices:{E10:{pence:e10,submittedAt:hours(submitted)},B7S:{pence:e10+24,submittedAt:hours(submitted)}},observedAt:hours(1),source:'Fuel fixture'});
const stations=[station('near','Near forecourt','Esso',[-.9725,51.4575],175.9),station('tesco','Tesco Extra','TESCO',[-.956,51.460],173.9),station('mid','Mid forecourt','BP',[-.99,51.45],174.9),
 station('m4','Reading West Services M4','Moto',[-1.03,51.43],198.9),station('costco','Costco Reading','COSTCO',[-.93,51.44],165.9),station('old','Old price garage','MFG',[-.98,51.46],160.9,24*21)];
const place=(id,name,rating,lon,lat)=>[id,name,0,'1 Broad Street, Reading','RG1 2AA',lon,lat,rating,'2026-03-17',0];
const hygiene={schema:1,source:'Food Standards Agency food hygiene rating scheme',sourceUrl:'https://ratings.food.gov.uk/open-data',licence:'Open Government Licence v3.0',generatedAt:new Date().toISOString(),
 authorities:[{code:'884',name:'Reading',extractDate:'2026-09-16',total:3,mapped:3,inArea:3}],types:['Restaurant/Cafe/Canteen'],
 places:[place(1,'Good Cafe','5',-.9722,51.4580),place(2,'Poor Grill','1',-.9716,51.4586),place(3,'New Kitchen','AwaitingInspection',-.9712,51.4578)]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/data/hygiene.json',route=>route.fulfill({json:hygiene}));
 await page.route('**/api/v1/**',async route=>{const url=new URL(route.request().url()),path=url.pathname;let body;
  if(path.endsWith('/config'))body={tomtom:false,weather:false,fuel:true,rivers:false};
  else if(path.endsWith('/fuel'))body={data:stations};
  else if(path.endsWith('/fuel-history'))body={version:1,id:url.searchParams.get('id'),days:[{day:'2026-09-27',observedAt:hours(30),prices:{E10:{pence:174.9,submittedAt:hours(40)}}},{day:'2026-09-28',observedAt:hours(1),prices:{E10:{pence:175.9,submittedAt:hours(2)}}}]};
  else body={data:[]};return route.fulfill({json:body});});
 await page.goto(base);await page.locator('#loading').waitFor({state:'hidden'});
 page.on('console',m=>{if(m.type()==='error')console.log('console:',m.text());});await expect(page.locator('#fuel-summary')).toContainText('6 forecourts',{timeout:30000});
 await page.locator('#fuel-layer').check();await page.locator('#tools-toggle').click();await page.locator('#fuel-compare').click();
 const view=page.locator('#fuel-view');
 await expect(view).toContainText('Cheapest');await expect(view).toContainText('173.9p · Tesco Extra');
 await expect(view).toContainText('Left out as members only: Costco Reading 165.9p');
 await expect(view).toContainText('1 price is left out because it was reported more than seven days ago');
 await expect(view).toContainText('(motorway services)');
 // Tank of 55 litres: middle price of four current (174.9, 175.9) = 175.4p, so 1.5p a litre saves £0.83.
 await expect(view.locator('.fuel-saving')).toContainText('£0.83');await expect(view.locator('.fuel-saving')).toContainText('£13.75');
 await expect(view).toContainText('Nearest: Near forecourt');
 await expect(view).toContainText('By bus: £5.40');
 await expect(view.locator('#fuel-bus-link')).toContainText('Nearest stop:');
 await view.locator('[data-fuel-grade=B7S]').click();await expect(view).toContainText('197.9p · Tesco Extra');
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/fuel-panel.png'});
 await page.locator('#fuel-pick').click();await page.mouse.click(900,500);await expect(view).toContainText('From the point you picked');
 await page.locator('#close-details').click();
 // Station detail with its recorded days.
 await page.locator('summary',{hasText:'Useful places'}).click();await page.locator('#hygiene-layer').check();await expect(page.locator('#hygiene-summary')).toContainText('3 premises · 1 rated 0 to 2');
 await page.locator('.hygiene-find summary').click();await page.getByLabel('Find a food business').fill('poor');await page.getByRole('button',{name:'Poor Grill · rated 1'}).click();
 await expect(page.locator('#details')).toContainText('1 out of 5');await expect(page.locator('#details')).toContainText('Major improvement necessary');await expect(page.locator('#details')).toContainText('17 March 2026');
 await page.waitForTimeout(2500);await page.locator('#close-details').click();await page.locator('[data-hygiene-filter=poor]').click();await page.waitForTimeout(600);
 await page.screenshot({path:'test-results/hygiene-layer.png'});
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Browser: fuel spread, members-only and old prices, detour, car against bus, grade switch, start picking and the hygiene layer passed.');
}finally{await browser.close();}
