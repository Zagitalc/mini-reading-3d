import {chromium} from '@playwright/test';import {access,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const results=[];
try{for(const [label,url,staging]of [['baseline','https://mini-reading-3d.reading-maps.workers.dev',false],['phase','http://127.0.0.1:5174',true]]){
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.addInitScript(()=>{window.readingTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.readingTools[t.name]=t.execute;}}});});
 if(staging)await page.route('**/data/**',async route=>{const file=path.resolve('raw/staging',new URL(route.request().url()).pathname.slice(6));try{await access(file);await route.fulfill({path:file,contentType:file.endsWith('.json')?'application/json':'application/x-protobuf'});}catch{await route.continue();}});
 await page.goto(url);await page.locator('#loading').waitFor({state:'hidden'});await page.locator('#landmark-buttons button').filter({hasText:'Station'}).click();await page.waitForTimeout(4000);
 await page.locator('[data-layer=buses]').uncheck();await page.locator('[data-layer=trains]').uncheck();await page.locator('#orbit-view').click();
 const timing=await page.evaluate(()=>new Promise(resolve=>{const deltas=[];let last=performance.now(),start=last;function step(now){deltas.push(now-last);last=now;if(now-start<4000)requestAnimationFrame(step);else{deltas.sort((a,b)=>a-b);resolve({frames:deltas.length,medianMs:deltas[Math.floor(deltas.length*.5)],p95Ms:deltas[Math.floor(deltas.length*.95)]});}}requestAnimationFrame(step);}));
 const state=await page.evaluate(()=>window.readingTools.reading_get_map_state({}));results.push({label,timing,rendering:state.rendering});await page.close();
}await mkdir('test-results',{recursive:true});await writeFile('test-results/performance.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
