import {chromium,expect} from '@playwright/test';
import {mkdir,access,writeFile} from 'node:fs/promises';
import path from 'node:path';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results={};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(`${m.text()} ${m.location().url}`);});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.addInitScript(()=>{window.readingTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.readingTools[t.name]=t.execute;}}});});
 if(process.env.STAGING_DATA)await page.route('**/data/**',async route=>{const rel=new URL(route.request().url()).pathname.slice('/data/'.length),file=path.resolve(process.env.STAGING_DATA,rel);if(!file.startsWith(path.resolve(process.env.STAGING_DATA)+path.sep))return route.abort();try{await access(file);await route.fulfill({path:file,contentType:file.endsWith('.json')?'application/json':'application/x-protobuf'});}catch{await route.continue();}});
 await mkdir('test-results',{recursive:true});
 await page.goto(process.env.APP_URL??'http://127.0.0.1:5174/');await page.locator('#loading').waitFor({state:'hidden'});
 await expect(page.locator('[data-route-layer=rail]')).toBeEnabled();
 await expect(page.locator('[data-route-layer=bus]')).not.toBeChecked();await expect(page.locator('[data-route-layer=rail]')).not.toBeChecked();
 await page.locator('#landmark-buttons button').filter({hasText:'Station'}).click();await page.waitForTimeout(2300);
 await page.screenshot({path:'test-results/station-oblique.png'});
 await page.locator('#tilt-view').click();await page.waitForTimeout(1100);await page.screenshot({path:'test-results/station-overhead.png'});
 await page.locator('#tilt-view').click();await page.waitForTimeout(1100);
 results.baseline=await page.evaluate(()=>window.readingTools.reading_get_map_state({}));
 await page.locator('[data-route-layer=bus]').check();await page.getByRole('searchbox',{name:'Search bus routes'}).fill('17');
 await page.getByLabel('Bus routes selector',{exact:true}).selectOption('RBUS:17');await expect(page.getByRole('heading',{name:'17',exact:true})).toBeVisible();
 await expect(page.locator('[data-layer=buses]')).toBeChecked();await expect(page.locator('[data-layer=trains]')).toBeChecked();
 await page.locator('#close-details').click();await page.locator('.route-control').first().getByRole('button',{name:'All routes',exact:true}).click();
 await page.locator('#tilt-view').click();await page.waitForTimeout(1000);
 const candidates=await page.evaluate(async()=>{
  const routes=await(await fetch('/data/bus-routes.json')).json(),points=new Map();
  for(const r of routes)for(const line of r.coordinates)for(const p of line){const key=p.join(',');if(!points.has(key))points.set(key,{p,ids:new Set()});points.get(key).ids.add(r.id);}
  const state=window.readingTools.reading_get_map_state({}),world=512*2**state.zoom,b=-24*Math.PI/180;
  const merc=p=>[(p[0]+180)/360,(1-Math.asinh(Math.tan(p[1]*Math.PI/180))/Math.PI)/2],c=merc(state.center);
  return [...points.values()].filter(v=>v.ids.size>1).map(v=>{const p=merc(v.p),dx=(p[0]-c[0])*world,dy=(p[1]-c[1])*world;return {x:720+dx*Math.cos(b)+dy*Math.sin(b),y:500-dx*Math.sin(b)+dy*Math.cos(b)};}).filter(p=>p.x>350&&p.x<1100&&p.y>200&&p.y<780).slice(0,100);
 });
 let overlap=false;for(const p of candidates){await page.mouse.click(p.x,p.y);if(await page.locator('#route-choices').count()){overlap=true;await page.locator('#route-choices button').first().click();break;}}
 if(!overlap)throw Error('No overlapping route chooser opened');await page.locator('#close-details').click();await page.locator('.route-control').first().getByRole('button',{name:'All routes',exact:true}).click();await page.locator('#tilt-view').click();await page.waitForTimeout(1000);
 await page.locator('[data-route-layer=rail]').check();await page.getByRole('searchbox',{name:'Search train routes'}).fill('Earley');
 await page.getByLabel('Train routes selector',{exact:true}).selectOption('wokingham');await expect(page.getByText('Physical railway corridor.',{exact:false})).toBeVisible();await page.locator('#close-details').click();
 await page.locator('[data-layer=buses]').uncheck();await page.locator('[data-layer=trains]').uncheck();await expect(page.locator('[data-route-layer=bus]')).toBeChecked();await expect(page.locator('[data-route-layer=rail]')).toBeChecked();
 await page.locator('[data-layer=traffic]').uncheck();await expect(page.locator('#traffic-legend')).toBeHidden();await page.locator('[data-layer=traffic]').check();
 await page.screenshot({path:'test-results/routes-desktop.png'});
 await page.locator('[data-route-layer=bus]').uncheck();await page.locator('[data-route-layer=rail]').uncheck();
 await page.locator('#landmark-buttons button').filter({hasText:'Oracle'}).click();await page.waitForTimeout(2300);await page.screenshot({path:'test-results/oracle-oblique.png'});
 await page.locator('#tilt-view').click();await page.waitForTimeout(1100);await page.screenshot({path:'test-results/oracle-overhead.png'});
 await page.locator('#tilt-view').click();await page.waitForTimeout(1100);
 await page.mouse.move(950,540);await page.mouse.down({button:'right'});await page.mouse.move(1200,540,{steps:20});await page.mouse.up({button:'right'});await page.waitForTimeout(600);await page.screenshot({path:'test-results/oracle-reverse.png'});
 await page.setViewportSize({width:390,height:844});await page.reload();await page.locator('#loading').waitFor({state:'hidden'});await expect(page.locator('[data-route-layer=rail]')).toBeEnabled();await page.locator('#collapse-layers').click();await page.locator('[data-route-layer=bus]').check();await page.getByRole('searchbox',{name:'Search bus routes'}).fill('17');await page.getByLabel('Bus routes selector',{exact:true}).selectOption('RBUS:17');await expect(page.getByRole('heading',{name:'17',exact:true})).toBeVisible();await page.locator('#close-details').click();await page.screenshot({path:'test-results/routes-mobile.png'});
 if(errors.length)throw Error(errors.join('\n'));await writeFile('test-results/phase-metrics.json',JSON.stringify(results,null,2));console.log('Phase desktop/mobile interactions passed',JSON.stringify(results));
}finally{await browser.close();}
