import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const url=process.env.APP_URL??'http://127.0.0.1:8790';
const output=process.env.BENCHMARK_OUTPUT??'test-results/performance.json';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report={schema:1,camera:{center:[-.9718,51.4589],zoom:17,pitch:60,bearing:-24},warmupSeconds:20,sampleSeconds:20,fixture:'Static town; live feeds, weather and traffic disabled; route and stop overlays off',browser:browser.version(),samples:[]};
try {
 for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>route.fulfill({json:route.request().url().includes('/config')?{tomtom:false,weather:false,fuel:false}:{version:1,data:[],routes:{}}}));
  await page.addInitScript(()=>{window.readingTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.readingTools[t.name]=t.execute;}}});});
  await page.goto(url);await page.locator('#loading').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'↗ Station',exact:true}).click();
  const stops=page.locator('#bus-stops-toggle');if(await stops.count()){await page.waitForFunction(()=>!document.querySelector('#bus-stops-toggle')?.disabled);await stops.evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change'));});}
  await page.waitForTimeout(20_000);
  const timing=await page.evaluate(()=>new Promise(resolve=>{const deltas=[];let last=performance.now(),start=last;function step(now){deltas.push(now-last);last=now;if(now-start<20_000)requestAnimationFrame(step);else{deltas.sort((a,b)=>a-b);resolve({frames:deltas.length,medianMs:deltas[Math.floor(deltas.length*.5)],p95Ms:deltas[Math.floor(deltas.length*.95)]});}}requestAnimationFrame(step);}));
  const state=await page.evaluate(()=>window.readingTools.reading_get_map_state({}));
  if(errors.length||state.rendering.failedChunks)throw Error(JSON.stringify({errors,rendering:state.rendering}));
  report.samples.push({label,viewport:{width,height},timing,rendering:state.rendering});
  console.log(label,JSON.stringify(report.samples.at(-1)));await page.close();
 }
 if(process.env.BENCHMARK_COMPARE){const baseline=JSON.parse(await readFile(process.env.BENCHMARK_COMPARE,'utf8'));for(const sample of report.samples){const prior=baseline.samples.find(s=>s.label===sample.label);for(const k of ['chunks','geometries','drawCalls'])if(sample.rendering[k]>prior.rendering[k]*1.2)throw Error(`${sample.label} ${k} grew by more than 20%`);}}
 await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();}
