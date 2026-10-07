import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
// Graphics test tool: shows the device, spins the map for ten seconds and writes a copyable report.
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.APP_URL??'http://127.0.0.1:8790',shots='test-results';await mkdir(shots,{recursive:true});
async function open(viewport){
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',route=>{const key=new URL(route.request().url()).pathname.slice(8);
  if(key.startsWith('traffic-tiles'))return route.fulfill({status:204});
  return route.fulfill({json:key==='config'?{tomtom:false,weather:false,fuel:false,rivers:false}:{version:1,data:[],routes:{}}});});
 await page.goto(`${base}/?mode=explore`);await page.locator('#loading').waitFor({state:'hidden'});
 await page.locator('.graphics-open').waitFor({state:'attached',timeout:60000});
 return {page,errors};
}
try{
 for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const {page,errors}=await open(viewport);
  if(await page.locator('#tools-list').isHidden())await page.locator('#tools-toggle').click();
  await page.locator('.graphics-open').click();
  await expect(page.locator('#graphics-view .graphics-device')).toContainText('Map canvas');
  await expect(page.locator('#graphics-view .graphics-device')).toContainText('Graphics chip');
  await page.locator('#graphics-run').click();
  await expect(page.locator('#graphics-result')).toContainText('Recording',{timeout:20000});
  await expect(page.locator('.graphics-verdict')).toBeVisible({timeout:40000});
  const text=await page.locator('.graphics-report').inputValue();
  for(const part of ['Mini Reading graphics test','Screen:','Result:','Frame time: median'])expect(text).toContain(part);
  await expect(page.locator('#graphics-run')).toBeEnabled();
  await page.locator('.graphics-report').scrollIntoViewIfNeeded();await page.screenshot({path:`${shots}/graphics-test-${label}.png`});
  console.log(label,text.split('\n').filter(l=>/^(Result|Frames|Frame time)/.test(l)).join(' | '));
  if(errors.length)throw Error(errors.join('; '));
  await page.close();
 }
 console.log('graphics test ok');
}finally{await browser.close();}
