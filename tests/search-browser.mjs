import {chromium,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
// Unified search: one box over places, landmarks, routes, stops, food, fuel and river gauges, ordered by mode.
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.APP_URL??'http://127.0.0.1:8790',shots='test-results';await mkdir(shots,{recursive:true});
const now=new Date().toISOString(),hygiene=JSON.parse(await readFile('public/data/hygiene.json','utf8'));
const tesco=hygiene.places.find(p=>/tesco/i.test(p[1])&&hygiene.types[p[2]]==='Restaurant/Cafe/Canteen')??hygiene.places.find(p=>hygiene.types[p[2]]==='Restaurant/Cafe/Canteen');
const station={id:'tesco-fuel',name:'Tesco Napier Road',brand:'TESCO',position:[-.956,51.460],postcode:'RG1 8BW',quiet:false,prices:{E10:{pence:133.9,submittedAt:now}},observedAt:now,source:'Fuel fixture'};
const gauge={id:'g1',kind:'gauge',reference:'2604TH',label:'Caversham Lock',river:'River Thames',position:[-.9669,51.4637],levels:[{id:'m1',qualifier:'Stage',unit:'mASD',value:1.34,readAt:now}],typicalLow:1,typicalHigh:1.6,observedAt:now,source:'River fixture'};
async function open(query='',viewport={width:1440,height:1000}){
 const page=await browser.newPage({viewport}),errors=[],hygieneRequests=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().endsWith('/data/hygiene.json'))hygieneRequests.push(r.url());});
 await page.route('**/api/v1/**',route=>{const key=new URL(route.request().url()).pathname.slice(8);
  if(key.startsWith('traffic-tiles'))return route.fulfill({status:204});
  const body=key==='config'?{tomtom:false,weather:false,fuel:true,rivers:true}:key==='fuel'?{data:[station]}:key==='rivers'?{data:[gauge],warningsCurrent:true}:{version:1,data:[],routes:{}};
  return route.fulfill({json:body});});
 await page.goto(base+query);await page.locator('#loading').waitFor({state:'hidden'});
 await page.waitForFunction(()=>!document.querySelector('#bus-stops-toggle')?.disabled&&!document.querySelector('[data-route-layer=bus]')?.disabled,null,{timeout:120000});
 await page.waitForFunction(()=>/gauges/.test(document.querySelector('#river-summary')?.textContent??''),null,{timeout:60000});
 return {page,errors,hygieneRequests};
}
const box=page=>page.getByRole('searchbox',{name:'Search Mini Reading'});
const groups=page=>page.locator('#search-results .search-group h3').allTextContents();
// Transport: routes and stops lead; "17" finds route 17 first. Food is not fetched for a one-character query.
{const {page,errors,hygieneRequests}=await open('/?mode=transport');
 await box(page).fill('17');
 await expect(page.locator('#search-results .search-group').first().locator('button').first()).toContainText('Route 17');
 if((await groups(page))[0]!=='Bus routes and rail corridors')throw Error(`transport order: ${await groups(page)}`);
 await page.screenshot({path:shots+'/search-route.png'});
 await page.locator('#search-results button',{hasText:'Route 17'}).first().click();
 await expect(page.locator('#details-content h2')).toHaveText('17');await expect(page.locator('[data-route-layer=bus]')).toBeChecked();
 if(new URL(page.url()).searchParams.get('route')!=='17')throw Error('route search did not reach the shared link');
 // A word search spans groups; Tesco finds the forecourt and food premises.
 await box(page).fill('tesco');
 await expect(page.locator('#search-results [aria-label="Fuel forecourts"] button').first()).toContainText('Tesco Napier Road');
 await expect(page.locator('#search-results [aria-label="Food premises"] button').first()).toBeVisible();
 if(hygieneRequests.length!==1)throw Error(`food ratings fetched ${hygieneRequests.length} times`);
 await page.screenshot({path:shots+'/search-tesco.png'});
 // "Show more" expands a group.
 const more=page.locator('#search-results [aria-label="Food premises"] .search-more');
 if(await more.count()){const before=await page.locator('#search-results [aria-label="Food premises"] button:not(.search-more)').count();await more.click();
  await expect(page.locator('#search-results [aria-label="Food premises"] button:not(.search-more)')).not.toHaveCount(before);}
 // Fuel result: switches the fuel layer on and opens the forecourt card.
 await page.locator('#search-results [aria-label="Fuel forecourts"] button').first().click();
 await expect(page.locator('#details-content h2')).toHaveText('Tesco Napier Road');await expect(page.locator('#fuel-layer')).toBeChecked();
 // River name lists its gauges; the card opens.
 await box(page).fill('thames');await page.locator('#search-results [aria-label="River gauges"] button').first().click();
 await expect(page.locator('#details-content h2')).toHaveText('Caversham Lock');
 // Keyboard: Enter opens the first result.
 await box(page).fill('oracle');await box(page).press('Enter');await expect(page.locator('#details-content h2')).toHaveText('The Oracle');
 // Stops by code, and a stop opens with its departures.
 await box(page).fill("st mary's butts");await expect(page.locator('#search-results [aria-label="Bus stops"] button').first()).toBeVisible();
 await page.locator('#search-results [aria-label="Bus stops"] button').first().click();await expect(page.locator('#details-content .pill')).toHaveText('Bus stop · timetable');
 // Nothing found says what search covers.
 await box(page).fill('qqqzzz');await expect(page.locator('.search-empty')).toContainText('Nothing on the map matches');
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
// Food mode: food premises lead, and a food result switches the ratings on and opens its card.
{const {page,errors}=await open('/?mode=food');
 await box(page).fill(tesco[1].slice(0,12));
 await expect(page.locator('#search-results .search-group h3').first()).toHaveText('Food premises');
 await page.locator('#search-results [aria-label="Food premises"] button').first().click();
 await expect(page.locator('#details-content .pill')).toHaveText('Food hygiene rating');await expect(page.locator('#hygiene-layer')).toBeChecked();
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
// Explore: places still work as before, and a search that started before the ratings were on leaves the layer working.
{const {page,errors}=await open('/?mode=explore');
 await box(page).fill('Caversham');
 await expect(page.locator('#search-results .search-group h3').first()).toHaveText('Places');
 await page.locator('#search-results button',{hasText:/^CavershamSuburb$/}).first().click();
 await expect(page.locator('.view-caption .eyebrow')).toHaveText('CAVERSHAM');
 await box(page).fill('pizza');await expect(page.locator('#search-results [aria-label="Food premises"]')).toBeVisible();
 await page.locator('.layer-group:has([data-group=places]) > summary').click();await page.locator('#hygiene-layer').check();await page.waitForFunction(()=>/food premises/.test(document.querySelector('#hygiene-summary')?.textContent??''),null,{timeout:20000});
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
// Phone: results fit and a result closes the list.
{const {page,errors}=await open('/?mode=transport',{width:390,height:844});
 await box(page).fill('station');await expect(page.locator('#search-results button').first()).toBeVisible();
 await page.screenshot({path:shots+'/search-phone.png'});
 await page.locator('#search-results button').first().click();await expect(page.locator('#search-results')).toBeHidden();
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
await browser.close();
console.log('Search browser checks passed');
