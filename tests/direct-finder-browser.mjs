import {chromium,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
// Direct bus finder: pick a start and a destination on the map, list direct buses, and say so plainly when there are none.
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.APP_URL??'http://127.0.0.1:8790',shots='test-results';await mkdir(shots,{recursive:true});
const index=JSON.parse(await readFile('public/data/bus-stops.json','utf8'));
// Route 17's longest stop pattern, from its own journeys file, so the test follows the timetable snapshot.
const route=Object.entries(index.routes).find(([,r])=>r.label==='17'),journeys=JSON.parse(await readFile('public'+route[1].journeysUrl,'utf8'));
const pattern=journeys.patterns.reduce((a,b)=>b.stops.length>a.stops.length?b:a),byId=new Map(index.stops.map(s=>[s.id,s]));
const onRoute=pattern.stops.map(id=>byId.get(id).position);
const metres=(a,b)=>Math.hypot((a[0]-b[0])*111320*Math.cos(a[1]*Math.PI/180),(a[1]-b[1])*111200);
async function open(viewport={width:1440,height:1000}){
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // A weekday morning inside the timetable, so the test does not depend on the hour it runs.
 await page.clock.setFixedTime(new Date('2026-10-07T10:00:00Z'));
 await page.route('**/api/v1/**',route=>{const key=new URL(route.request().url()).pathname.slice(8);
  if(key.startsWith('traffic-tiles'))return route.fulfill({status:204});
  return route.fulfill({json:key==='config'?{tomtom:false,weather:false,fuel:false,rivers:false}:{version:1,data:[],routes:{}}});});
 await page.goto(`${base}/?mode=transport`);await page.locator('#loading').waitFor({state:'hidden'});
 await page.waitForFunction(()=>!document.querySelector('#bus-stops-toggle')?.disabled,null,{timeout:120000});
 await page.locator('.direct-open:not([disabled])').waitFor({state:'attached',timeout:30000});
 return {page,errors};
}
async function openFinder(page){
 if(await page.locator('#tools-list').isHidden())await page.locator('#tools-toggle').click();
 await page.locator('.direct-open').click();
}
async function tap(page,end,x,y){
 await page.getByRole('button',{name:new RegExp(`(Choose|Change) ${end==='from'?'start':'destination'} on the map`)}).click();
 await expect(page.locator('#pick-bar')).toBeVisible();await page.waitForTimeout(300);
 await page.mouse.click(x,y);await expect(page.locator('#pick-bar')).toBeHidden();
 const text=await page.locator('.direct-picks p').nth(end==='from'?0:1).innerText(),[lat,lng]=text.match(/-?\d+\.\d+/g).map(Number);return [lng,lat];
}
{const {page,errors}=await open();
 await page.getByRole('button',{name:'Show whole map'}).click();await page.waitForTimeout(3000);
 await openFinder(page);
 await expect(page.locator('#direct-view')).toContainText('not chosen');
 // The map has no test handle, so learn its scale by tapping two known screen points and reading the coordinates back.
 const box=await page.locator('canvas.maplibregl-canvas').first().boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
 const c0=await tap(page,'from',cx,cy),c1=await tap(page,'from',cx+200,cy+150),kx=(c1[0]-c0[0])/200,ky=(c1[1]-c0[1])/150;
 const px=p=>[cx+(p[0]-c0[0])/kx,cy+(p[1]-c0[1])/ky],clear=([x,y])=>x>470&&x<1330&&y>180&&y<920;
 const visible=onRoute.map((p,i)=>({p,i,at:px(p)})).filter(s=>clear(s.at));
 const a=visible[0],b=visible.at(-1);if(!a||b.i-a.i<5)throw Error('route 17 is not in view on the default map');
 // A spot at least a kilometre from every stop.
 let empty;for(let x=480;x<1320&&!empty;x+=40)for(let y=200;y<900&&!empty;y+=40){const p=[c0[0]+(x-cx)*kx,c0[1]+(y-cy)*ky];if(index.stops.every(s=>metres(p,s.position)>1000))empty=[x,y];}
 if(!empty)throw Error('no stop-free point on the default map');
 await tap(page,'from',...a.at);await tap(page,'to',...b.at);
 const first=page.locator('.direct-option').first();await expect(first).toBeVisible({timeout:30000});
 await expect(first).toContainText('17');await expect(first).toContainText('Get off at');await expect(first).toContainText('min on the bus');
 await expect(page.locator('#direct-results')).toContainText('Scheduled times, not live');
 if(!(await page.locator('.direct-times li').count()))throw Error('no departure times listed');
 await page.screenshot({path:shots+'/direct-finder.png'});
 // The other way round is a different set of buses, or none; either way the list redraws without error.
 await tap(page,'from',...b.at);await tap(page,'to',...a.at);
 await expect(page.locator('#direct-results')).toContainText(/direct option|No direct bus found/,{timeout:30000});
 // A destination a kilometre from any stop has nothing to walk to.
 await tap(page,'to',...empty);
 await expect(page.locator('#direct-results')).toContainText('No direct bus found between nearby stops.',{timeout:30000});
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
// Cancelling a pick keeps the card and its earlier choices.
{const {page,errors}=await open({width:390,height:844});
 await openFinder(page);
 await page.getByRole('button',{name:'Choose start on the map'}).click();await page.locator('#pick-cancel').click();
 await expect(page.locator('#direct-view')).toContainText('not chosen');
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
await browser.close();
console.log('Direct bus finder browser checks passed');
