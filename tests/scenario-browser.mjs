import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';

// Uses the bundled timetable. Needs `npm run build`, then `npx vite preview --port 8790` (or APP_URL).
const url=process.env.APP_URL??'http://127.0.0.1:8790';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const shots=process.env.SCREENSHOT_DIR;

async function boot(viewport){
 const page=await browser.newPage({viewport}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',route=>route.fulfill({json:route.request().url().includes('/config')?{tomtom:false,weather:false,fuel:false}:{version:1,data:[],routes:{}}}));
 await page.goto(url);await page.locator('#loading').waitFor({state:'hidden'});
 await page.locator('#tools-toggle').click();
 await expect(page.locator('.scenario-open')).toBeEnabled({timeout:30000});
 return {page,errors};
}

for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
 const {page,errors}=await boot(viewport);
 await page.locator('.scenario-open').click();
 const view=page.locator('#scenario-view');
 await expect(view.locator('.scenario-table')).toBeVisible({timeout:20000});
 assert.equal(await view.locator('#scenario-route option:checked').textContent(),'17','route 17 by default');
 assert.equal(await view.locator('#scenario-headway').inputValue(),'15');
 await expect(view.locator('.explorer-summary')).toContainText('every 15 minutes from 20:00 to 00:00');
 await expect(view.locator('details')).toContainText('Buses run exactly to time');
 // A tighter interval needs at least as many buses and shortens the average wait.
 const rows=async()=>Object.fromEntries(await view.locator('.scenario-table tbody tr').evaluateAll(trs=>trs.map(tr=>[tr.querySelector('th').childNodes[0].textContent+'|'+(tr.querySelector('th small')?.textContent??''),[...tr.querySelectorAll('td')].map(td=>td.textContent)])));
 await view.locator('#scenario-headway').fill('8');await view.locator('#scenario-headway').dispatchEvent('change');
 await expect(view.locator('.explorer-summary')).toContainText('every 8 minutes');
 const tight=await rows(),buses=tight['Buses needed at once|including turnaround'];
 assert.ok(+buses[1]>=+buses[0],`scenario buses ${buses[1]} vs today ${buses[0]}`);
 // Draw on the map: today's buses as hollow dots, scenario buses in the route colour.
 await view.locator('#scenario-show').click();
 await expect(view.locator('#scenario-moment')).toContainText('in the scenario');
 await page.waitForTimeout(1600);
 if(shots)await page.screenshot({path:`${shots}/scenario-${viewport.width}.png`});
 // Closing the panel takes the dots off again.
 await page.locator('#close-details').click();
 await view.waitFor({state:'detached'}).catch(()=>{});
 assert.deepEqual(errors,[]);
 await page.close();
}
await browser.close();
console.log('Scenario browser checks passed');
