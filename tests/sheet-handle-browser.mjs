import {chromium,expect} from '@playwright/test';

const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.APP_URL??'http://127.0.0.1:8790';
const errors=[];
async function open(viewport,touch=false){
 const page=await browser.newPage({viewport,isMobile:touch,hasTouch:touch,reducedMotion:'reduce',colorScheme:touch?'dark':'light'});
 page.on('pageerror',error=>errors.push(error.message));
 const now=new Date().toISOString();
 const fuel={id:'map-sheet-fuel',name:'Caversham Esso Express',brand:'Esso',postcode:'RG4 8AU',
  position:[-.971,51.468],prices:{E10:{pence:142.9,submittedAt:now}},observedAt:now,source:'Test fixture'};
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/config'))return route.fulfill({json:{tomtom:false,weather:false,fuel:true,rivers:false}});
  if(path.endsWith('/fuel'))return route.fulfill({json:{data:[fuel]}});
  if(path.endsWith('/fuel-history'))return route.fulfill({json:{days:[]}});
  return route.fulfill({json:{version:1,data:[],routes:{}}});
 });
 await page.goto(base);
 await page.locator('#loading').waitFor({state:'hidden'});
 await page.locator('#data-button').waitFor({state:'attached'});
 return page;
}
async function drag(page,locator,dy){
 const box=await locator.boundingBox();
 const x=box.x+box.width/2,y=box.y+Math.min(14,box.height/2);
 await page.mouse.move(x,y);
 await page.mouse.down();
 await page.mouse.move(x,y+dy,{steps:8});
 await page.mouse.up();
}
async function touchDrag(page,locator,dy){
 const box=await locator.boundingBox();
 const x=Math.round(box.x+box.width/2),y=Math.round(box.y+14);
 const session=await page.context().newCDPSession(page);
 try{
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=6;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:Math.round(y+dy*i/6)}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }finally{await session.detach();}
}
async function mapHitShare(page){
 return page.evaluate(()=>{
  let hits=0,total=0;
  for(let y=5;y<innerHeight;y+=10)for(let x=5;x<innerWidth;x+=10){
   total++;
   const element=document.elementFromPoint(x,y);
   if(element?.closest('#map')&&!element.closest('.maplibregl-control-container,.maplibregl-marker'))hits++;
  }
  return hits/total;
 });
}

try{
 for(const viewport of [{width:360,height:640},{width:390,height:740},{width:768,height:1024},{width:844,height:390}]){
  const page=await open(viewport,true);
  const menu=page.locator('#map-menu'),menuButton=page.locator('#mobile-menu-toggle');
  const details=page.locator('#details'),handle=page.locator('#sheet-handle');
  await expect(menu).toBeHidden();
  await expect(menuButton).toHaveAttribute('aria-expanded','false');
  expect(await mapHitShare(page)).toBeGreaterThanOrEqual(.75);
  await menuButton.tap();
  await expect(menu.getByRole('heading',{name:'Map settings'})).toBeVisible();
  await expect(menu.locator('[data-mode]:visible')).toHaveCount(6);
  await expect(menu.locator('#close-map-menu')).toBeVisible();
  await menu.locator('#close-map-menu').tap();
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();
  await menuButton.tap();
  await touchDrag(page,menu.locator('#menu-handle'),90);
  await expect(menu).toBeHidden();
  const map=page.locator('.maplibregl-canvas');
  await expect(map).toBeVisible();
  const centre=await page.evaluate(()=>{
   const rect=document.querySelector('.maplibregl-canvas').getBoundingClientRect();
   for(let dy=-40;dy<=60;dy+=20)for(let dx=-40;dx<=60;dx+=20){
    const x=Math.round(rect.width*.55+dx),y=Math.round(rect.height*.48+dy);
    const element=document.elementFromPoint(x,y);
    if(element?.matches('.maplibregl-canvas'))return {x,y};
   }
   return null;
  });
  expect(centre).not.toBeNull();
  const coordinates=page.locator('#view-coordinates');
  const before=await coordinates.textContent();
  await page.mouse.move(centre.x,centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x-70,centre.y+45,{steps:8});
  await page.mouse.up();
  await expect(coordinates).not.toHaveText(before);

  await page.locator('#mobile-search').tap();
  await expect(page.locator('#search')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await menuButton.tap();
  const status=menu.locator('#data-button');
  await expect(status).toBeEnabled();
  await status.tap();
  await expect(details).toBeVisible();
  await expect(menu).toBeHidden();
  const previewShare=await mapHitShare(page);
  const short=(await details.boundingBox()).height;
  await handle.tap();
  await expect(handle).toHaveAttribute('aria-expanded','true');
  await expect.poll(async()=>(await details.boundingBox()).height).toBeGreaterThan(short);
  await drag(page,handle,90);
  await expect(handle).toHaveAttribute('aria-expanded','false');
  await drag(page,handle,-20);
  await expect(handle).toHaveAttribute('aria-expanded','false');
  await touchDrag(page,handle,90);
  await expect(details).toBeHidden();

  await menuButton.tap();
  await status.tap();
  await expect(details).toBeVisible();
  await details.getByRole('button',{name:'Close details'}).tap();
  await expect(details).toBeHidden();
  const mapShare=await mapHitShare(page);
  expect(mapShare).toBeGreaterThanOrEqual(.75);
  if(viewport.width===390){
   const out=process.env.MOBILE_SCREENSHOTS;
   if(out)await page.screenshot({path:out+'/mobile-map-local.png'});
   await menuButton.tap();
   expect(await menu.locator('.map-menu-content').evaluate(el=>el.scrollTop)).toBe(0);
   if(out)await page.screenshot({path:out+'/mobile-menu-local.png'});
   await menu.locator('[data-mode=drive]').tap();
   await expect(menu).toBeHidden();
   await expect(page.locator('#mobile-mode')).toHaveText('Drive');

   for(const [query,title,file] of [['Caversham Esso','Caversham Esso Express','fuel'],['3','3','route']]){
    await page.locator('#mobile-search').tap();
    await page.locator('#search').fill(query);
    await page.locator('#search-results').getByRole('button',{name:file==='route'?/^Route 3\b/:title}).first().tap();
    await expect(details.getByRole('heading',{name:title,exact:true})).toBeVisible();
    await expect(menu).toBeHidden();
    if(out)await page.screenshot({path:out+'/mobile-'+file+'-local.png'});
    await details.getByRole('button',{name:'Close details'}).tap();
   }
   await page.setViewportSize({width:1440,height:900});
   await expect(page.locator('.topbar #data-button')).toBeVisible();
   await expect(menu).toBeVisible();
   await page.setViewportSize(viewport);
   await expect(menu).toBeHidden();
   await expect(menuButton).toHaveAttribute('aria-expanded','false');
  }
  console.log(viewport.width+' × '+viewport.height+': '+Math.round(mapShare*100)+'% map area, '+Math.round(previewShare*100)+'% with details');
  await page.close();
 }

 const desktop=await open({width:1440,height:900});
 await expect(desktop.locator('#mobile-menu-toggle')).toBeHidden();
 await expect(desktop.locator('#map-menu')).toBeVisible();
 await expect(desktop.locator('#data-button')).toBeVisible();
 const layers=desktop.locator('#layers');
 await expect(layers).toBeVisible();
 await desktop.locator('#collapse-layers').click();
 await expect(layers).toBeHidden();
 await desktop.locator('#collapse-layers').click();
 await expect(layers).toBeVisible();
 await desktop.locator('#data-button').click();
 await expect(desktop.locator('#details')).toBeVisible();
 await expect(desktop.locator('#sheet-handle')).toBeHidden();
 expect(errors).toEqual([]);
 console.log('Desktop sidebar and details verified');
}finally{await browser.close();}
