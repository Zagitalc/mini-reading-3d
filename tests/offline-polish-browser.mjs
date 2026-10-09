import {chromium,expect} from '@playwright/test';
// Offline, the station card says why the live board cannot load instead of suggesting a retry.
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.APP_URL??'http://127.0.0.1:8790';
try{
 const context=await browser.newContext({viewport:{width:412,height:700},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let offline=false;
 await page.route('**/api/v1/**',route=>{if(offline)return route.abort('internetdisconnected');const key=new URL(route.request().url()).pathname.slice(8);
  if(key.startsWith('traffic-tiles'))return route.fulfill({status:204});
  return route.fulfill({json:key==='config'?{tomtom:false,weather:false,fuel:false,rivers:false}:{version:1,data:[],routes:{}}});});
 await page.goto(`${base}/?mode=explore`);await page.locator('#loading').waitFor({state:'hidden',timeout:90000});
 // Open the card once online so its code is loaded; offline, only the live board request fails.
 await page.locator('.landmark-pin').first().dispatchEvent('click');await expect(page.locator('#details')).toBeVisible();await page.locator('#close-details').tap();
 offline=true;await context.setOffline(true);
 await expect(page.locator('#offline-banner')).toBeVisible();
 await page.locator('.landmark-pin').first().dispatchEvent('click');
 await expect(page.locator('#details')).toBeVisible();
 await expect(page.locator('#details')).toContainText('needs a connection',{timeout:15000});
 await page.locator('#close-details').tap();
 await context.setOffline(false);offline=false;
 expect(errors.filter(e=>!e.includes('dynamically imported module'))).toEqual([]);console.log('offline polish ok');
}finally{await browser.close();}
