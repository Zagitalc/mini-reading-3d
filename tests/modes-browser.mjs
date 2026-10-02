import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
// Map modes: each mode's first requests, switching modes, a manual override, and the address and stored mode.
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.APP_URL??'http://127.0.0.1:8790',shots='test-results';await mkdir(shots,{recursive:true});
const now=new Date().toISOString();
async function open(query='',viewport={width:1440,height:1000},storage){
 const page=await browser.newPage({viewport}),counts={},errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(storage)await page.addInitScript(s=>localStorage.setItem('mini-reading-mode',s),storage);
 await page.route('**/api/v1/**',route=>{const path=new URL(route.request().url()).pathname;const key=path.startsWith('/api/v1/traffic-tiles')?'tiles':path.slice(8);counts[key]=(counts[key]??0)+1;
  let body={version:1,data:[],routes:{}};
  if(key==='config')body={tomtom:true,weather:true,fuel:true,rivers:true};
  else if(key==='vehicle-state')body={version:1,data:[{id:'fixture:bus',kind:'bus',label:'17',position:[-.972,51.457],bearing:90,observedAt:now,source:'fixture',status:'observed',routeGroupId:'RBUS:17',routeMatch:'direction'}],routes:{}};
  else if(key==='health')body={data:[{id:'buses',label:'Buses',state:'live',count:1,message:'ok',lastSuccess:now},{id:'traffic',label:'Traffic',state:'live',count:0,message:'Tiles load',lastSuccess:now}]};
  else if(key==='tiles')return route.fulfill({status:204});
  return route.fulfill({json:body});});
 await page.goto(base+query);await page.locator('#loading').waitFor({state:'hidden'});await page.locator('#hygiene-layer').waitFor({state:'attached',timeout:120000});await page.waitForFunction(()=>!document.querySelector('#bus-stops-toggle')?.disabled,null,{timeout:120000});await page.waitForTimeout(1500);
 return {page,counts,errors};
}
const pressed=p=>p.locator('[data-mode][aria-pressed=true]').getAttribute('data-mode');
// Default: Transport.
{const {page,counts,errors}=await open();
 if(await pressed(page)!=='transport')throw Error('default mode');
 if(!counts['vehicle-state'])throw Error('transport should request vehicles');if(counts.tiles)throw Error('transport requested traffic tiles');
 await expect(page.locator('[data-layer=traffic]')).not.toBeChecked();await expect(page.locator('[data-layer=buses]')).toBeChecked();
 await expect(page.locator('#bus-stops-toggle')).toBeChecked();
 await page.screenshot({path:shots+'/modes-desktop-transport.png'});
 // Switch to Drive: traffic tiles start, fuel on, buses off.
 await page.locator('[data-mode=drive]').click();await page.waitForTimeout(1500);
 await expect(page.locator('[data-layer=traffic]')).toBeChecked();await expect(page.locator('#fuel-layer')).toBeChecked();await expect(page.locator('[data-layer=buses]')).not.toBeChecked();
 if(!counts.tiles)throw Error('drive did not request traffic tiles');
 if(!page.url().includes('mode=drive'))throw Error('URL not updated');
 const v=counts['vehicle-state'];
 // Manual override stays: switch buses back on in Drive.
 await page.locator('[data-layer=buses]').check();await page.waitForTimeout(800);
 if(counts['vehicle-state']<=v)throw Error('turning buses on did not fetch vehicles at once');
 await page.screenshot({path:shots+'/modes-desktop-drive.png'});
 await page.locator('[data-mode=lab]').click();await page.waitForTimeout(2500);
 await expect(page.locator('#hygiene-layer')).toBeChecked();await expect(page.locator('#river-layer')).toBeChecked();
 await page.screenshot({path:shots+'/modes-desktop-lab.png'});
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
// Explore from storage: no vehicles, no tiles.
{const {page,counts,errors}=await open('', undefined,'explore');
 if(await pressed(page)!=='explore'||counts['vehicle-state']||counts.tiles)throw Error('explore fetched vehicles or tiles');
 await expect(page.locator('#bus-stops-toggle')).not.toBeChecked();
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
// Address wins over storage.
{const {page,counts}=await open('?mode=environment',undefined,'drive');
if(await pressed(page)!=='environment'||counts.tiles||counts['vehicle-state'])throw Error('address mode');
 await expect(page.locator('#river-layer')).toBeChecked();await page.close();}
// Food: ratings on and their filters shown, no vehicles or traffic.
{const {page,counts,errors}=await open('?mode=food');
 if(await pressed(page)!=='eat'||counts['vehicle-state']||counts.tiles)throw Error('eat fetched vehicles or tiles');
 await expect(page.locator('#hygiene-layer')).toBeChecked();await expect(page.locator('.hygiene-filters')).toHaveCount(2);for(const row of await page.locator('.hygiene-filters').all())await expect(row).toBeVisible();await expect(page.locator('#hygiene-summary')).toContainText('premises');
 await page.locator('[data-food-type=pub-bar]').click();await page.locator('[data-hygiene-filter="5"]').click();await expect(page.locator('#hygiene-summary')).toContainText('food premises match');
 await page.screenshot({path:shots+'/modes-desktop-food.png'});
 await page.locator('[data-mode=explore]').click();await expect(page.locator('#hygiene-layer')).not.toBeChecked();
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
// Phone.
{const {page}=await open('?mode=transport',{width:390,height:844});
 await page.screenshot({path:shots+'/modes-phone.png'});await page.close();}
await browser.close();console.log('Map modes browser check passed');
