import {chromium,expect} from '@playwright/test';
// "Around here": the list follows the middle of the map, can be pinned, and each item jumps to its own card.
const base=process.env.APP_URL??'http://127.0.0.1:8790',now=new Date().toISOString();
const [lng,lat]=[-0.9718,51.4589];// Reading station
const at=(m)=>[lng+m/69_500,lat];
const ev=(id,kind,m,status='active')=>({id,title:`${kind==='closure'?'Closed':'Digging'} ${id}`,description:'Test event',organisation:'Test',geometry:{type:'Point',coordinates:at(m)},kind,status,version:1,source:'test',observedAt:now,plannedStart:'2026-10-01',plannedEnd:'2026-12-01'});
const events=[ev('works-near','works',100),ev('closure-far','closure',500),ev('works-planned','works',300,'planned'),ev('closure-out','closure',5000)];
const gauge={id:'ea:T1',kind:'gauge',reference:'T1',label:'Test Lock',river:'River Thames',position:at(1500),levels:[{id:'m1',qualifier:'Stage',unit:'mASD',value:1.34,readAt:now}],typicalLow:1.05,typicalHigh:1.3,observedAt:now,source:'River fixture',sourceUrl:'https://example.test/station/T1'};
const square=(c,h)=>[[c[0]-h,c[1]-h],[c[0]+h,c[1]-h],[c[0]+h,c[1]+h],[c[0]-h,c[1]+h],[c[0]-h,c[1]-h]];
const warning={id:'flood:A1',kind:'warning',areaId:'A1',label:'Thames at Test',severityLevel:3,severity:'Flood alert',message:'Fixture alert',raisedAt:now,river:'River Thames',area:{type:'MultiPolygon',coordinates:[[square([lng,lat],.004)]]},observedAt:now,source:'River fixture',sourceUrl:'https://example.test/area/A1'};
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const slow={timeout:20000};
async function open(zoom,mode='lab',viewport={width:1300,height:900}){
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',route=>{const key=new URL(route.request().url()).pathname.slice(8);
  if(key.startsWith('traffic-tiles'))return route.fulfill({status:204});
  const body=key==='config'?{tomtom:false,weather:false,fuel:false,rivers:true}:key==='road-events'?{version:1,data:events}:key==='rivers'?{version:1,warningsCurrent:true,data:[gauge,warning]}:{version:1,data:[],routes:{}};
  return route.fulfill({json:body});});
 const events$=page.waitForResponse('**/api/v1/road-events',{timeout:60000}),rivers$=page.waitForResponse('**/api/v1/rivers',{timeout:60000});
 await page.goto(`${base}/?mode=${mode}&lat=${lat}&lng=${lng}&zoom=${zoom}`);await page.locator('#loading').waitFor({state:'hidden'});await events$;await rivers$;
 await page.waitForFunction(()=>!document.querySelector('#bus-stops-toggle')?.disabled,null,{timeout:120000});
 await page.waitForFunction(()=>(document.querySelector('#here-body')?.children.length??0)>0,null,{timeout:60000});
 return {page,errors};
}
const group=(page,name)=>page.locator(`#here-card section[aria-label="${name}"]`);
{const {page,errors}=await open(15);
 await expect(page.locator('#here-card .here-where')).toContainText('Middle of the map · within 800\u00a0m',slow);
 // Roadworks: the closure comes first even though the works are nearer; the planned works are labelled scheduled; the 5 km one is out of reach.
 const works=group(page,'Roadworks and closures').locator('li');
 await expect(works).toHaveCount(3,slow);
 await expect(works.nth(0)).toContainText('Closed closure-far');await expect(works.nth(0)).toContainText('Observed');
 await expect(works.nth(1)).toContainText('Digging works-near');
 await expect(works.nth(2)).toContainText('Scheduled');
 await expect(page.locator('#here-card')).not.toContainText('closure-out');
 await expect(group(page,'Flood warnings')).toContainText('area covers this spot');
 await expect(group(page,'River gauges')).toContainText('Test Lock');
 await expect(group(page,'River gauges')).toContainText('Observed');
 await expect(group(page,'Bus stops').locator('li').first()).toContainText('Stop ');
 await expect(group(page,'Railway station')).toContainText('Live departures');
 // Selecting an item opens its usual card.
 await works.nth(0).locator('button').click();
 await expect(page.locator('#details')).toContainText('Closed closure-far',slow);
 await group(page,'Railway station').locator('button').click();
 await expect(page.locator('#details')).toContainText('Reading station',slow);
 // Pinning keeps the spot while the map moves.
 await page.locator('#here-card .here-pin').click();
 await expect(page.locator('#here-card .here-where')).toContainText('Pinned spot');
 const before=await page.locator('#here-card .here-where').innerText();
 await page.mouse.move(650,450);await page.mouse.down();await page.mouse.move(250,250,{steps:8});await page.mouse.up();await page.waitForTimeout(1200);
 await expect(page.locator('#here-card .here-where')).toContainText('Pinned spot');
 assert(before===await page.locator('#here-card .here-where').innerText());
 await page.locator('#here-card .here-pin').click();
 await expect(page.locator('#here-card .here-where')).toContainText('Middle of the map');
 // Switching a layer off removes its group.
 // The switch sits in a collapsed group, so flip it the way the mode buttons do.
 await page.locator('[data-layer=roadworks]').evaluate(el=>el.click());
 await expect(group(page,'Roadworks and closures')).toHaveCount(0,slow);
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
// Zoomed out (below zoom 13) the area is larger, ordinary works are left out as on the map, and stops (not drawn yet) are not listed.
{const {page,errors}=await open(12);
 await expect(page.locator('#here-card .here-where')).toContainText('within 3.0\u00a0km',slow);
 const works=group(page,'Roadworks and closures').locator('li');
 await expect(works).toHaveCount(1,slow);
 await expect(works.first()).toContainText('Closed closure-far');
 await expect(page.locator('#here-card')).not.toContainText('Digging');
 await expect(group(page,'Bus stops')).toHaveCount(0);
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
await browser.close();
console.log('Around here: ordering, evidence labels, jump to cards, pinning, layer switch and zoom rules passed.');
function assert(ok){if(!ok)throw Error('Pinned spot changed while the map moved');}
