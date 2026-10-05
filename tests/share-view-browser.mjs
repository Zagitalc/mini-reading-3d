import {chromium,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
// Share this view: a link opens its mode, camera and card; the address follows the view; the button copies the link.
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.APP_URL??'http://127.0.0.1:8790',shots='test-results';await mkdir(shots,{recursive:true});
const stops=JSON.parse(await readFile('public/data/bus-stops.json','utf8')),hygiene=JSON.parse(await readFile('public/data/hygiene.json','utf8'));
const stop=stops.stops.find(s=>s.timetableUrl),premises=hygiene.places.find(p=>hygiene.types[p[2]]==='Restaurant/Cafe/Canteen');
async function open(query,viewport={width:1440,height:1000}){
 const context=await browser.newContext({viewport,permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',route=>{const key=new URL(route.request().url()).pathname.slice(8);
  if(key.startsWith('traffic-tiles'))return route.fulfill({status:204});
  return route.fulfill({json:key==='config'?{tomtom:false,weather:false,fuel:false,rivers:false}:{version:1,data:[],routes:{}}});});
 await page.goto(base+query);await page.locator('#loading').waitFor({state:'hidden'});
 await page.locator('#hygiene-layer').waitFor({state:'attached',timeout:120000});await page.waitForFunction(()=>!document.querySelector('#bus-stops-toggle')?.disabled,null,{timeout:120000});
 return {page,context,errors};
}
const param=(page,k)=>new URL(page.url()).searchParams.get(k);
// A stop with a camera: the card opens, the stops layer comes on even in Explore, and the camera is the link's.
{const {page,context,errors}=await open(`/?mode=explore&stop=${stop.id}&lat=51.45500&lng=-0.97000&zoom=16.25&pitch=40&bearing=15`);
 await expect(page.locator('#details-content h2')).toHaveText(stop.name);
 await expect(page.locator('#bus-stops-toggle')).toBeChecked();
 await expect(page.locator('[data-mode=explore]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.view-caption .eyebrow')).toHaveText('SHARED VIEW');
 if(param(page,'zoom')!=='16.25'||param(page,'lat')!=='51.45500'||param(page,'bearing')!=='15')throw Error(`camera not kept: ${page.url()}`);
 if(param(page,'stop')!==stop.id)throw Error('stop dropped from the address');
 await page.screenshot({path:shots+'/share-stop.png'});
 // Copy the link: the clipboard holds the address, and the toast says what it opens.
 await page.locator('#share-view').click();
 await expect(page.locator('#toast')).toHaveText(/Link copied\. It opens this mode, this view and the open card/);
 if(await page.evaluate(()=>navigator.clipboard.readText())!==page.url())throw Error('clipboard differs from the address');
 // Closing the card drops it from the link; moving the map updates the camera after a short pause.
 await page.locator('#close-details').click();await page.waitForTimeout(200);
 if(param(page,'stop')!==null)throw Error('closed card still in the address');
 await page.locator('#home-view').click();
 await page.waitForFunction(()=>new URL(location.href).searchParams.get('zoom')==='15.5',null,{timeout:15000}).catch(()=>{throw Error(`zoom not updated after moving: ${page.url()}`);});
 // A mode change keeps the camera in the address.
 await page.locator('[data-mode=drive]').click();await page.waitForTimeout(800);
 if(param(page,'mode')!=='drive'||!param(page,'lat'))throw Error(`mode change lost the camera: ${page.url()}`);
 if(errors.length)throw Error(errors.join('\n'));await context.close();}
// A bus route by label, any case, with no camera: the route layer comes on and the map frames the route.
{const {page,context,errors}=await open('/?mode=explore&route=17');
 await expect(page.locator('#details-content h2')).toHaveText('17');
 await expect(page.locator('[data-route-layer=bus]')).toBeChecked();
 await page.waitForFunction(()=>new URL(location.href).searchParams.has('lat'),null,{timeout:15000}).catch(()=>{throw Error('camera not written after framing the route');});
 if(param(page,'route')!=='17')throw Error('route not in the address');
 await page.screenshot({path:shots+'/share-route.png'});
 // Opening something else replaces the card in the link.
 await page.locator('.stop-control summary').click();await page.locator('.stop-control .stop-search input').fill(stop.code);
 await page.locator('.stop-control .stop-results button').first().click();
 await expect(page.locator('#details-content h2')).toHaveText(stop.name);
 if(param(page,'route')!==null||param(page,'stop')!==stop.id)throw Error(`selection not replaced: ${page.url()}`);
 if(errors.length)throw Error(errors.join('\n'));await context.close();}
{const {page,context,errors}=await open('/?route=19A');await expect(page.locator('#details-content h2')).toHaveText('19a');if(errors.length)throw Error(errors.join('\n'));await context.close();}
// A food premises: ratings switch on and its card opens.
{const {page,context,errors}=await open(`/?mode=transport&food=${premises[0]}`);
 await expect(page.locator('#details-content h2')).toHaveText(premises[1]);await expect(page.locator('#hygiene-layer')).toBeChecked();
 await page.screenshot({path:shots+'/share-food.png'});
 if(errors.length)throw Error(errors.join('\n'));await context.close();}
// A landmark, and the station's live board.
{const {page,context,errors}=await open('/?landmark=station');
 await expect(page.locator('#details-content h2')).toHaveText('Reading station');if(param(page,'landmark')!=='station')throw Error('station not in the address');
 if(errors.length)throw Error(errors.join('\n'));await context.close();}
// Bad links fall back quietly: an unknown stop says so, and a camera outside the map opens the usual view.
{const {page,context,errors}=await open('/?stop=nonsense&lat=51.5074&lng=-0.1278&zoom=14');
 await expect(page.locator('#toast')).toHaveText('That bus stop in this link is not in the current data.');
 await expect(page.locator('.view-caption .eyebrow')).toHaveText('READING STATION');
 if(errors.length)throw Error(errors.join('\n'));await context.close();}
// Phone: the button sits in the map tools above the bottom sheet.
{const {page,context,errors}=await open(`/?stop=${stop.id}`,{width:390,height:844});
 await expect(page.locator('#details-content h2')).toHaveText(stop.name);await expect(page.locator('#share-view')).toBeVisible();
 await page.screenshot({path:shots+'/share-phone.png'});
 if(errors.length)throw Error(errors.join('\n'));await context.close();}
{const {page,context,errors}=await open('/?mode=explore',{width:844,height:390});await expect(page.locator('#share-view')).toBeVisible();
 await page.screenshot({path:shots+'/share-landscape.png'});if(errors.length)throw Error(errors.join('\n'));await context.close();}
await browser.close();
console.log('Share view browser checks passed');
