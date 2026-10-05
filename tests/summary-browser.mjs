import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
// Mode summary cards: each mode's card from feeds the layers already load, ageing, phone folding, and no extra requests.
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.APP_URL??'http://127.0.0.1:8790',shots='test-results';await mkdir(shots,{recursive:true});
const now=new Date().toISOString(),ago=m=>new Date(Date.now()-m*60000).toISOString();
const bus=(i,route)=>({id:`fixture:bus${i}`,kind:'bus',label:route,position:[-.972+i*.001,51.457],bearing:90,observedAt:now,source:'fixture',status:'observed',routeGroupId:`RBUS:${route}`,routeMatch:'direction'});
const vehicles=[bus(1,'17'),bus(2,'17'),bus(3,'21'),{id:'fixture:train',kind:'train',label:'GW',position:[-.9717,51.4584],observedAt:now,source:'fixture',status:'estimated'}];
const fuel=[['costco','Costco Reading','COSTCO',129.9],['tesco','Tesco Napier Road','TESCO',132.9],['bp','BP Oxford Road','BP',137.9]].map(([id,name,brand,pence])=>({id,name,brand,position:[-.97,51.45],postcode:'RG1',quiet:false,prices:{E10:{pence,submittedAt:ago(120)}},observedAt:ago(30),source:'Fuel fixture'}));
const gauge=(id,label,value)=>({id,kind:'gauge',reference:id,label,river:'River Thames',position:[-.9669,51.4637],levels:[{id:'m',qualifier:'Stage',unit:'mASD',value,readAt:now}],typicalLow:1,typicalHigh:1.6,observedAt:now,source:'River fixture'});
const events=[{id:'e1',title:'Works A',description:'',organisation:'x',geometry:{type:'Point',coordinates:[-.97,51.455]},kind:'works',status:'active',version:1,observedAt:now,source:'fixture'},{id:'e2',title:'Closure B',description:'',organisation:'x',geometry:{type:'Point',coordinates:[-.96,51.455]},kind:'closure',status:'active',version:1,observedAt:now,source:'fixture'}];
async function open(query,{viewport={width:1440,height:1000},warnings=[]}={}){
 const page=await browser.newPage({viewport}),counts={},errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',route=>{const path=new URL(route.request().url()).pathname,key=path.slice(8);counts[key]=(counts[key]??0)+1;
  if(key.startsWith('traffic-tiles'))return route.fulfill({status:204});
  const body=key==='config'?{tomtom:false,weather:true,fuel:true,rivers:true}
   :key==='vehicle-state'?{version:1,data:vehicles,routes:{}}:key==='road-events'?{version:1,data:events}:key==='fuel'?{data:fuel}
   :key==='weather'?{data:[{id:'w',temperature:13.4,cloudCover:80,rainMm:.4,snowCm:0,intervalSeconds:900,code:61,windKph:12,windDirection:200,isDay:true,observedAt:now,source:'fixture'}]}
   :key==='rivers'?{data:[gauge('g1','Caversham Lock',1.34),gauge('g2','Theale',1.9),...warnings],warningsCurrent:true}
   :key==='health'?{data:[{id:'buses',label:'Buses',state:'live',count:3,message:'ok',lastSuccess:now}]}:{version:1,data:[],routes:{}};
  return route.fulfill({json:body});});
 await page.goto(base+query);await page.locator('#loading').waitFor({state:'hidden'});
 await page.waitForFunction(()=>!/loading/i.test(document.querySelector('#river-summary')?.textContent??'Rivers loading')&&!document.querySelector('#bus-stops-toggle')?.disabled,null,{timeout:120000});
 return {page,counts,errors};
}
const card=page=>page.locator('#mode-card-body');
// Transport: buses by route, estimated trains, roadworks and closures.
{const {page,counts,errors}=await open('/?mode=transport');
 await expect(card(page)).toContainText('3 buses on 2 routes');await expect(card(page)).toContainText('1 train, positions estimated');
 await expect(card(page)).toContainText('2 active roadworks, 1 closure among them');await expect(page.locator('#mode-card-title')).toHaveText('Right now');
 await page.screenshot({path:shots+'/summary-transport.png'});
 // Search button focuses the box.
 await card(page).getByRole('button',{name:/Search routes and stops/}).click();
 await expect(page.getByRole('searchbox',{name:'Search Mini Reading'})).toBeFocused();
 // The card adds no requests of its own: stations board and history are not touched.
 for(const k of ['rail-board','history','fuel-history'])if(counts[k])throw Error(`card fetched ${k}`);
 // Drive: roadworks, fuel, weather. No vehicle fetch needed for the card, and the buses line is gone.
 await page.locator('[data-mode=drive]').click();
 await expect(card(page)).toContainText('Cheapest E10');await expect(card(page)).toContainText('Costco Reading 129.9p (members only)');
 await expect(card(page)).toContainText('Without membership');await expect(card(page)).toContainText('Tesco Napier Road 132.9p');
 await expect(card(page)).toContainText('Middle price');await expect(card(page)).toContainText('13°C, rain');await expect(card(page)).not.toContainText('buses on');
 await page.screenshot({path:shots+'/summary-drive.png'});
 await page.locator('[data-mode=environment]').click();
 await expect(card(page)).toContainText('None in force');await expect(card(page)).toContainText('2 river gauges');await expect(card(page)).toContainText('1 within typical range, 1 above');await expect(card(page)).toContainText('Theale');
 await page.screenshot({path:shots+'/summary-environment.png'});
 await page.locator('[data-mode=eat]').click();
 await expect(page.locator('#mode-card-title')).toHaveText('In the data');await expect(card(page)).toContainText('places to eat or drink',{timeout:20000});
 await expect(card(page)).toContainText('restaurants and cafés');await expect(card(page)).toContainText('hygiene only, not food quality');
 await page.screenshot({path:shots+'/summary-food.png'});
 await page.locator('[data-mode=explore]').click();
 await expect(card(page)).toContainText('building footprints');await expect(card(page)).toContainText('Reading station, 60 m');
 await page.locator('[data-mode=lab]').click();
 await expect(card(page)).toContainText('3 buses on 2 routes');await expect(card(page)).toContainText('Cheapest E10');await expect(card(page)).toContainText('Flood warnings');
 await page.screenshot({path:shots+'/summary-lab.png'});
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
// A flood warning shows in the Environment card.
{const warning={id:'w1',kind:'warning',areaId:'a',label:'Thames at Caversham',severityLevel:3,severity:'Flood alert',river:'River Thames',area:null,sourceUrl:'https://example.com',observedAt:now,source:'fixture'};
 const {page,errors}=await open('/?mode=environment',{warnings:[warning]});await expect(card(page)).toContainText('1 flood alert in force');
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
// Phone: the card starts folded, opens on tap, and the choice survives a refresh of the figures.
{const {page,errors}=await open('/?mode=transport',{viewport:{width:390,height:844}});
 await page.locator('#collapse-layers').click();
 await expect(page.locator('#mode-card')).not.toHaveAttribute('open','');
 await page.locator('#mode-card-title').click();await expect(card(page)).toContainText('3 buses on 2 routes');
 await page.screenshot({path:shots+'/summary-phone.png'});
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
await browser.close();
console.log('Summary card browser checks passed');
