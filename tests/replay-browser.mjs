import {chromium,expect} from '@playwright/test';
// Tools > Replay: refuses until two snapshots are buffered, then replays them with a clear "historical" label and a way back to live.
const base=process.env.APP_URL??'http://127.0.0.1:8790';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const slow={timeout:20000};
const bus=(at,metres)=>({id:'bods:test',kind:'bus',position:[-0.9718+metres/69500,51.4589],observedAt:new Date(at).toISOString(),label:'17',status:'observed',source:'test'});
try{
 for(const [name,viewport] of [['desktop',{width:1300,height:900}],['phone',{width:390,height:800}]]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/v1/**',route=>{const key=new URL(route.request().url()).pathname.slice(8);
   if(key.startsWith('traffic-tiles'))return route.fulfill({status:204});
   const body=key==='config'?{tomtom:false,weather:false,fuel:false,rivers:false}:{version:1,data:[],routes:{}};
   return route.fulfill({json:body});});
  await page.goto(`${base}/?mode=transport&lat=51.4589&lng=-0.9718&zoom=16`);await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.__replay?.frames()>=1,null,{timeout:120000});
  const openTools=async()=>{if(name==='phone'&&!await page.locator('.explore-panel.mobile-open').count())await page.locator('#collapse-layers').click();if(await page.locator('#tools-list').isHidden())await page.locator('#tools-toggle').click();};
  await openTools();
  const open=page.locator('.replay-open'),bar=page.locator('.replay-bar');
  await open.scrollIntoViewIfNeeded();
  // One empty snapshot is not enough to replay.
  await open.click();await expect(page.locator('#toast')).toContainText('Replay needs',slow);await expect(bar).toBeHidden();
  // Two more snapshots, a minute apart, with a bus moving 600 m.
  const t=Date.now()+30_000;
  await page.evaluate(([a,b])=>{for(const [at,v] of [[a.at,a.bus],[b.at,b.bus]])document.dispatchEvent(new CustomEvent('reading-vehicles',{detail:{vehicles:[v],at}}));},[{at:t,bus:bus(t,0)},{at:t+60_000,bus:bus(t+60_000,600)}]);
  await expect.poll(()=>page.evaluate(()=>window.__replay.frames()),slow).toBe(3);
  await openTools();await open.click();
  await expect(bar).toBeVisible(slow);
  await expect(page.locator('body')).toHaveClass(/replaying/);
  await expect(bar.locator('.evidence.historical')).toBeVisible();
  await expect(bar.locator('.replay-length')).toContainText('positions seen on this device');
  await expect(bar.locator('.replay-length')).toContainText('Not live');
  await expect(open).toHaveAttribute('aria-pressed','true');
  const box=await bar.boundingBox();if(box.x<0||box.x+box.width>viewport.width+1)throw Error(`${name}: replay bar leaves the screen: ${JSON.stringify(box)}`);
  // Speed cycles, play and pause, and the slider moves the replay clock.
  const speed=bar.locator('.replay-speed');await expect(speed).toHaveText('30×');await speed.click();await expect(speed).toHaveText('60×');await speed.click();await speed.click();await expect(speed).toHaveText('30×');
  const play=bar.locator('.replay-play');if(await play.getAttribute('aria-label')==='Pause')await play.click();await expect(play).toHaveAttribute('aria-label','Play');await play.click();await expect(play).toHaveAttribute('aria-label','Pause');await play.click();await expect(play).toHaveAttribute('aria-label','Play');
  const slider=bar.locator('.replay-slider'),max=await slider.getAttribute('max'),min=await slider.getAttribute('min');
  if(!(Number(max)>Number(min)))throw Error('slider has no range');
  await slider.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},max);
  await expect.poll(()=>page.evaluate(()=>window.__replay.time()),slow).toBe(Number(max));
  await slider.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},min);
  await expect.poll(()=>page.evaluate(()=>window.__replay.time()),slow).toBe(Number(min));
  // Back to live.
  await bar.locator('.replay-live').click();
  await expect(bar).toBeHidden();await expect(page.locator('body')).not.toHaveClass(/replaying/);await expect(open).toHaveAttribute('aria-pressed','false');
  if(await page.evaluate(()=>window.__replay.active()))throw Error('replay still active');
  if(errors.length)throw Error(`${name} page errors: ${errors.join('; ')}`);
  await page.close();
 }
 console.log('Replay: waits for two snapshots, labelled historical, speed, pause, scrub, back to live and mobile width passed.');
}finally{await browser.close();}
