import {chromium,expect} from '@playwright/test';
// A landmark pin that sits on a visible bus route must open its own card, not the "Choose a route" list.
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.APP_URL??'http://127.0.0.1:8790';
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',route=>{const key=new URL(route.request().url()).pathname.slice(8);
  if(key.startsWith('traffic-tiles'))return route.fulfill({status:204});
  return route.fulfill({json:key==='config'?{tomtom:false,weather:false,fuel:false,rivers:false}:{version:1,data:[],routes:{}}});});
 await page.goto(`${base}/?mode=transport`);await page.locator('#loading').waitFor({state:'hidden'});
 await expect(page.locator('[data-route-layer=bus]')).toBeEnabled({timeout:60000});
 await page.locator('[data-route-layer=bus]').check();
 const pins=page.locator('.landmark-pin'),count=await pins.count();expect(count).toBeGreaterThan(3);
 // Zoomed out, the bus lines converge on the pins, which is where a tap used to land on the route list as well.
 let tapped=0;
 for(let i=0;i<count;i++){
  const name=await pins.nth(i).getAttribute('aria-label');
  await page.locator('#landmark-buttons button').nth(i).click();await page.waitForTimeout(2600);
  for(let z=0;z<5;z++){await page.locator('.maplibregl-ctrl-zoom-out').click();await page.waitForTimeout(500);}
  await page.waitForTimeout(800);
  const box=await pins.nth(i).boundingBox(),label=await pins.nth(i).locator('.pin-label').boundingBox();
  for(const [x,y] of [[box.x+box.width/2,box.y+box.height/2],[label.x+label.width/2,label.y+label.height/2]]){
   await page.mouse.click(x,y);await page.waitForTimeout(300);
   const heading=await page.locator('#details-content h2').first().innerText().catch(()=>'');
   expect(heading,`${name} opened the route list`).not.toBe('Choose a route');expect(heading).not.toBe('');tapped++;
   await page.locator('#close-details').click({timeout:1500}).catch(()=>{});
  }
 }
 expect(errors).toEqual([]);console.log('landmark pins ok',tapped);
}finally{await browser.close();}
