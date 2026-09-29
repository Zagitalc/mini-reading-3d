import type {Map,GeoJSONSource,MapMouseEvent} from 'maplibre-gl';
import type {FuelStation,LngLat} from '../../shared/types';
import type {StationPriceDay} from '../../shared/history';
import {GRADE_NAMES,band,detours,membersOnly,motorway,spread,tripCost,PRICE_MAX_AGE_MS,ROAD_FACTOR,type PriceRow} from '../../shared/fuel-compare';
import {BUS_FARES,busReturn} from '../../shared/fares';
import {LANDMARKS} from '../../shared/config';
import {distance} from '../../shared/geo';
import {detail,escape,startPick} from '../ui/shell';
import {PUMP_COLOURS,fuelPumpIcon} from './fuel-icon';
// Prices are shown as reported, each with its own submission time; nothing here estimates a price.
type Settings={grade:string;tank:number;fill:number;mpg:number;parking:number;dest:string};
const DEFAULTS:Settings={grade:'E10',tank:55,fill:40,mpg:45,parking:0,dest:'centre'};
const KEY='mini-reading:fuel-settings';
const landmark=(id:string)=>LANDMARKS.find(l=>l.id===id)!.position;
/** Approximate points for each trip end; the sums use straight-line distance times the road factor. */
const DESTINATIONS:{id:string;name:string;position:LngLat}[]=[
 {id:'centre',name:'Town centre (Broad Street)',position:[-0.9728,51.4561]},
 {id:'station',name:'Reading station',position:landmark('station')},
 {id:'hospital',name:'Royal Berkshire Hospital',position:[-0.9568,51.4497]},
 {id:'university',name:'University of Reading',position:landmark('university')},
 {id:'stadium',name:'Reading stadium',position:landmark('stadium')},
];
const when=(iso:string)=>new Date(iso).toLocaleString('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const ago=(hours:number)=>hours<1?'under an hour ago':hours<48?`${hours} h ago`:`${Math.round(hours/24)} days ago`;
const money=(v:number)=>`£${v.toFixed(2)}`;
const pence=(v:number)=>`${v.toFixed(1)}p`;
const gradeName=(g:string)=>GRADE_NAMES[g]??g;
const dayName=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString('en-GB',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'});
function loadSettings():Settings{try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(KEY)??'{}')};}catch{return {...DEFAULTS};}}
function saveSettings(s:Settings){try{localStorage.setItem(KEY,JSON.stringify(s));}catch{/* private mode: settings last for this visit only */}}
type StopIndex={stops:{id:string;name:string;position:LngLat;routeIds:string[]}[];routes:Record<string,{label:string}>};
let stopIndex:Promise<StopIndex|undefined>|undefined;
const stops=()=>stopIndex??=fetch('/data/bus-stops.json',{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():undefined).catch(()=>undefined);
/** The nearest stop to walk to, and every route calling within 400 m of both ends. */
function busLink(index:StopIndex,from:LngLat,to:LngLat){
 const near=(p:LngLat)=>index.stops.map(s=>({s,m:distance(p,s.position)})).sort((a,b)=>a.m-b.m);
 const a=near(from),b=near(to),routes=(list:typeof a)=>new Set(list.filter(x=>x.m<=400).flatMap(x=>x.s.routeIds));
 const there=routes(b),direct=[...routes(a)].filter(r=>there.has(r)).map(r=>index.routes[r]?.label??r);
 return {stop:a[0]?.s,metres:Math.round(a[0]?.m??Infinity),direct:[...new Set(direct)].sort((x,y)=>x.localeCompare(y,'en',{numeric:true}))};
}
const stationLine=(r:PriceRow,extra='')=>`<li><strong>${pence(r.pence)}</strong> ${escape(r.name)}${r.motorway?' <em>motorway services</em>':''}${extra}<small>${escape(r.brand)} · reported ${escape(when(r.submittedAt))} (${ago(r.ageHours)})</small></li>`;

export function connectFuel(map:Map,section:HTMLElement,enabled:boolean){
 let stations:FuelStation[]=[];const settings=loadSettings();let start:LngLat|undefined;
 map.addSource('fuel-stations',{type:'geojson',data:{type:'FeatureCollection',features:[]},attribution:'Fuel Finder via Cheap Fuel Near Me · OGL 3.0'});
 for(const [state,colour] of Object.entries(PUMP_COLOURS))map.addImage(`fuel-pump-${state}`,fuelPumpIcon(colour),{pixelRatio:2});
 map.addLayer({id:'fuel-points',type:'symbol',source:'fuel-stations',layout:{visibility:'none','icon-image':['concat','fuel-pump-',['get','state']],'icon-size':.85,'icon-anchor':'bottom','icon-allow-overlap':true,'icon-ignore-placement':true,'text-field':['get','label'],'text-size':11,'text-anchor':'top','text-offset':[0,.2],'text-font':['Noto Sans Regular'],'text-optional':true,'text-allow-overlap':true},minzoom:0,paint:{'text-color':['match',['get','state'],'cheap',PUMP_COLOURS.cheap,'dear',PUMP_COLOURS.dear,'old','#737a73','#7a3f10'],'text-halo-color':'#fffdf5','text-halo-width':1.6,'text-opacity':['step',['zoom'],0,13.5,1]}});
 map.addSource('fuel-start',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
 map.addLayer({id:'fuel-start-point',type:'circle',source:'fuel-start',layout:{visibility:'none'},paint:{'circle-radius':7,'circle-color':'#25483e','circle-stroke-color':'#fffdf5','circle-stroke-width':3}});
 const toggle=section.querySelector<HTMLInputElement>('#fuel-layer')!,compare=document.querySelector<HTMLButtonElement>('#fuel-compare')!;
 toggle.disabled=!enabled;compare.disabled=!enabled;
 const show=(on:boolean)=>{for(const id of ['fuel-points','fuel-start-point'])map.setLayoutProperty(id,'visibility',on?'visible':'none');};
 toggle.addEventListener('change',()=>show(toggle.checked));
 map.on('mouseenter','fuel-points',()=>{map.getCanvas().style.cursor='pointer';});
 map.on('mouseleave','fuel-points',()=>{map.getCanvas().style.cursor='';});
 const draw=()=>{
  const {median}=spread(stations,settings.grade,settings.tank);
  (map.getSource('fuel-stations') as GeoJSONSource).setData({type:'FeatureCollection',features:stations.map(s=>{const p=s.prices[settings.grade],old=!p||s.quiet||membersOnly(s)||Date.now()-Date.parse(p.submittedAt)>PRICE_MAX_AGE_MS;
   return {type:'Feature',geometry:{type:'Point',coordinates:s.position},properties:{id:s.id,state:old?'old':band(p.pence,median),label:p?`${p.pence.toFixed(1)}${membersOnly(s)?' members':''}`:''}};})});
  (map.getSource('fuel-start') as GeoJSONSource).setData({type:'FeatureCollection',features:start?[{type:'Feature',geometry:{type:'Point',coordinates:start},properties:{}}]:[]});
 };
 const grades=()=>Object.keys(GRADE_NAMES).filter(g=>stations.some(s=>s.prices[g]));
 function render(){
  const el=document.querySelector<HTMLElement>('#fuel-view');if(!el)return;
  if(!stations.length){el.innerHTML='<p>No fuel prices are available right now. The source updates twice a day; open this again later.</p>';return;}
  const s=spread(stations,settings.grade,settings.tank),snapshot=stations.map(x=>x.observedAt).sort().at(-1)!,snapshotAge=Math.round((Date.now()-Date.parse(snapshot))/3_600_000);
  const from=start??[map.getCenter().lng,map.getCenter().lat] as LngLat;
  const d=detours(s.current,from,settings.fill,settings.mpg),best=d.options[0];
  const dest=DESTINATIONS.find(x=>x.id===settings.dest)??DESTINATIONS[0];
  const trip=s.median!==undefined?tripCost({from,to:dest.position,mpg:settings.mpg,pence:s.median,parking:settings.parking,busReturn:busReturn(BUS_FARES)}):undefined;
  const number=(id:keyof Settings,label:string,min:number,max:number,step=1)=>`<label>${label}<input type="number" data-fuel-setting="${id}" value="${settings[id]}" min="${min}" max="${max}" step="${step}" inputmode="decimal"></label>`;
  el.innerHTML=`<div class="departure-views" role="group" aria-label="Fuel grade">${grades().map(g=>`<button type="button" data-fuel-grade="${g}" aria-pressed="${g===settings.grade}">${escape(gradeName(g))}</button>`).join('')}</div>
   <p class="${snapshotAge>=24?'schedule-notice':'explorer-note'}">Prices as of the source snapshot of ${escape(when(snapshot))} (${ago(snapshotAge)}).${snapshotAge>=24?' The source has not updated for over a day, so prices may have moved since.':''} Each forecourt’s price shows when that forecourt reported it.</p>
   ${s.cheapest?`<h3>Spread across Reading</h3><dl class="fuel-spread"><dt>Cheapest</dt><dd>${pence(s.cheapest.pence)} · ${escape(s.cheapest.name)}<small>Reported ${escape(when(s.cheapest.submittedAt))}</small></dd><dt>Middle price (median of ${s.current.length})</dt><dd>${pence(s.median!)}</dd><dt>Dearest</dt><dd>${pence(s.dearest!.pence)} · ${escape(s.dearest!.name)}${s.dearest!.motorway?' (motorway services)':''}<small>Reported ${escape(when(s.dearest!.submittedAt))}</small></dd></dl>
   <p class="fuel-saving">Filling a ${number('tank','',10,150)} litre tank at the cheapest saves <strong>${money(s.savingMedian)}</strong> against the middle price, or <strong>${money(s.savingDearest)}</strong> against the dearest.</p>`:`<p>No forecourt has reported a ${escape(gradeName(settings.grade))} price in the last seven days.</p>`}
   ${s.old.length?`<p class="explorer-note">${s.old.length} ${s.old.length===1?'price is':'prices are'} left out because ${s.old.length===1?'it was':'they were'} reported more than seven days ago or the site has gone quiet; they show grey on the map.</p>`:''}
   ${s.members.length?`<p class="explorer-note">Left out as members only: ${s.members.map(r=>`${escape(r.name)} ${pence(r.pence)}`).join(', ')}.</p>`:''}
   <details class="history-details"><summary>All ${s.current.length+s.old.length} ${escape(gradeName(settings.grade))} prices</summary><ol class="fuel-list">${s.current.map(r=>stationLine(r)).join('')}${s.old.map(r=>stationLine(r,' <em>old</em>')).join('')}</ol></details>
   <h3>Is the cheaper forecourt worth the drive?</h3>
   <p class="explorer-note">From ${start?'the point you picked':'the middle of the map'}. <button type="button" class="more-departures" id="fuel-pick">${start?'Pick again':'Pick a start on the map'}</button></p>
   <div class="explorer-controls">${number('fill','Filling (litres)',5,150)}${number('mpg','Car (mpg)',10,120)}</div>
   ${d.nearest?`<p>Nearest: <strong>${escape(d.nearest.row.name)}</strong>, about ${d.nearest.km} km by road, ${pence(d.nearest.row.pence)}: ${money(d.nearest.fillCost)} for ${settings.fill} litres.</p>
   ${best&&best.row.id!==d.nearest.row.id&&best.netSaving>0?`<p>Best value: <strong>${escape(best.row.name)}</strong> at ${pence(best.row.pence)}. The fill is ${money(best.fillCost)}, and the extra ${best.extraKm} km there and back burns about ${money(best.detourCost)} of fuel, so you are <strong>${money(best.netSaving)}</strong> better off.${best.netSaving<1?' That is small enough that the time is probably worth more.':''}</p>`:'<p>No other forecourt beats the nearest once the fuel to get there is counted.</p>'}
   <ol class="fuel-list">${d.options.slice(0,5).map(o=>`<li><strong>${o.netSaving>=0?'+':'−'}${money(Math.abs(o.netSaving))}</strong> ${escape(o.row.name)}<small>${pence(o.row.pence)} · ${o.km} km away · extra ${o.extraKm} km · reported ${escape(when(o.row.submittedAt))}</small></li>`).join('')}</ol>`:''}
   <h3>Car or bus into town?</h3>
   <div class="explorer-controls"><label>To<select data-fuel-setting="dest">${DESTINATIONS.map(x=>`<option value="${x.id}"${x.id===dest.id?' selected':''}>${escape(x.name)}</option>`).join('')}</select></label>${number('parking','Parking (£)',0,100,.1)}</div>
   ${trip?`<p>By car: about ${trip.km} km there and back, ${money(trip.fuel)} of ${escape(gradeName(settings.grade))} at the middle price${settings.parking?` plus ${money(settings.parking)} parking`:''}: <strong>${money(trip.car)}</strong>.</p>
   <p>By bus: <strong>${money(trip.bus)}</strong> for the return trip (${busReturn(BUS_FARES)===BUS_FARES.day?'a day ticket':'two singles'}).</p><p class="explorer-note" id="fuel-bus-link">Finding stops…</p>
   <p>${trip.car<trip.bus?`The car is ${money(trip.bus-trip.car)} cheaper on fuel${settings.parking?' and parking':''} alone`:`The bus is ${money(trip.car-trip.bus)} cheaper`}${settings.parking?'':'; add what you would pay to park'}.</p>`:''}
   <small>Road distance is taken as ${ROAD_FACTOR} times the straight line, so short trips are approximate. Car costs are fuel only, with no wear, insurance or tax. Bus fares are ${escape(BUS_FARES.operator)} adult ${escape(BUS_FARES.zone)} fares (single ${money(BUS_FARES.single)}, day ${money(BUS_FARES.day)}, cash or contactless; the app is slightly cheaper), checked ${escape(dayName(BUS_FARES.checkedOn))}: <a href="${BUS_FARES.sourceUrl}" target="_blank" rel="noopener">current fares</a>. Prices: Fuel Finder via Cheap Fuel Near Me, OGL v3.0.</small>`;
  el.querySelectorAll<HTMLButtonElement>('[data-fuel-grade]').forEach(b=>b.addEventListener('click',()=>{settings.grade=b.dataset.fuelGrade!;saveSettings(settings);draw();render();}));
  el.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-fuel-setting]').forEach(input=>input.addEventListener('change',()=>{const id=input.dataset.fuelSetting as keyof Settings;
   if(id==='dest'||id==='grade')settings[id]=input.value;else{const v=Number(input.value),min=Number(input.getAttribute('min')),max=Number(input.getAttribute('max'));if(Number.isFinite(v)&&v>=min&&v<=max)settings[id]=v;}
   saveSettings(settings);render();}));
  el.querySelector('#fuel-pick')?.addEventListener('click',()=>{map.getCanvas().style.cursor='crosshair';
   const picked=(e:MapMouseEvent)=>{done();map.getCanvas().style.cursor='';start=[e.lngLat.lng,e.lngLat.lat];if(!toggle.checked){toggle.checked=true;show(true);}draw();open();};
   const done=startPick('Tap the map where your trip starts',()=>{map.off('click',picked);map.getCanvas().style.cursor='';});
   map.once('click',picked);});
  if(trip)void stops().then(index=>{const target=el.querySelector('#fuel-bus-link');if(!target)return;if(!index){target.textContent='Bus stops could not load.';return;}
   const link=busLink(index,from,dest.position);
   target.textContent=link.stop&&link.metres<=800?`Nearest stop: ${link.stop.name}, about ${link.metres} m away. ${link.direct.length?`Direct routes: ${link.direct.slice(0,8).join(', ')}.`:'No route calls near both ends, so expect to change buses; a day ticket covers that.'}`:'No bus stop within 800 m of the start.';});
 }
 function open(){
  detail(`<span class="pill">Fuel and trips · reported prices</span><h2>What fuel costs in Reading</h2><div id="fuel-view" aria-live="polite"></div>`);render();
 }
 compare.addEventListener('click',open);
 map.on('click','fuel-points',e=>{if(map.getCanvas().style.cursor==='crosshair')return;const station=stations.find(s=>s.id===e.features?.[0]?.properties.id);if(!station)return;
  const {median}=spread(stations,settings.grade,settings.tank),p=station.prices[settings.grade];
  detail(`<span class="pill">Fuel prices · as reported</span><h2>${escape(station.name)}</h2><p>${escape(station.brand)} · ${escape(station.postcode)}${motorway(station)?' · motorway services':''}</p>${membersOnly(station)?'<p>Members only: this forecourt is left out of the town comparisons.</p>':''}${station.quiet?'<p>No prices submitted at this site for at least 14 days.</p>':''}
   <dl>${Object.entries(station.prices).map(([grade,x])=>{const days=Math.round((Date.now()-Date.parse(x.submittedAt))/86_400_000);return `<dt>${escape(gradeName(grade))}</dt><dd>${pence(x.pence)} a litre<small>Reported ${escape(when(x.submittedAt))}${days>7?` · ${days} days old, so it may have changed`:''}</small></dd>`;}).join('')}</dl>
   ${p&&median!==undefined&&!membersOnly(station)?`<p>${escape(gradeName(settings.grade))} here is ${Math.abs(p.pence-median)<.05?'the same as':`${Math.abs(p.pence-median).toFixed(1)}p ${p.pence<median?'below':'above'}`} the Reading middle price of ${pence(median)}: ${money(Math.abs(p.pence-median)*settings.tank/100)} a ${settings.tank}-litre tank.</p>`:''}
   <div id="fuel-station-history"><p class="explorer-note">Loading recorded prices…</p></div>
   <button type="button" class="status-button" id="fuel-open-compare">Compare prices and trips ↗</button>
   <p class="explorer-note">Source snapshot: ${escape(when(station.observedAt))}. ${station.locationRepaired?'The source reports a corrected location. ':''}<a href="https://cheapfuelnearme.uk/api/" target="_blank" rel="noopener">Fuel Finder via Cheap Fuel Near Me</a>; contains public sector information licensed under OGL v3.0.</p>`);
  document.querySelector('#fuel-open-compare')!.addEventListener('click',open);
  void loadHistory(station.id);
 });
 return {
  set(list:FuelStation[]){stations=list;draw();render();},
  get stations(){return stations;},
 };
}
async function loadHistory(id:string){
 const el=()=>document.querySelector<HTMLElement>('#fuel-station-history');
 try{const r=await fetch(`/api/v1/fuel-history?id=${encodeURIComponent(id)}&days=14`,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const data:{days:StationPriceDay[]}=await r.json();
  const target=el();if(!target)return;
  if(data.days.length<2){target.innerHTML='<p class="explorer-note">Daily prices for this forecourt are recorded from now on; a history appears after two days.</p>';return;}
  const grades=Object.keys(GRADE_NAMES).filter(g=>data.days.some(d=>d.prices[g]));
  target.innerHTML=`<table class="history-table"><caption>Recorded daily prices, newest first (each is the price the forecourt had reported by that day’s latest snapshot)</caption><thead><tr><th>Day</th>${grades.map(g=>`<th>${escape(gradeName(g))}</th>`).join('')}</tr></thead><tbody>${data.days.slice(-14).reverse().map(d=>`<tr><td>${escape(dayName(d.day))}</td>${grades.map(g=>{const x=d.prices[g];return `<td>${x?`<span title="Reported ${escape(when(x.submittedAt))}">${pence(x.pence)}</span>`:'—'}</td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
 }catch{const target=el();if(target)target.innerHTML='<p class="explorer-note">Recorded prices could not load.</p>';}
}
