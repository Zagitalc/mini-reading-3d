import type {Map,GeoJSONSource} from 'maplibre-gl';
import {FOOD_TYPES,RATING_FILTERS,RATING_TEXT,foodCategory,foodMatches,ratingGroup,type FoodTypeFilter,type HygieneBundle,type HygienePlace,type RatingFilter} from '../../shared/hygiene';
import {detail,escape,layerGroup} from '../ui/shell';
import {currentMode,registerSwitch} from '../ui/modes';
import {onLinked,setSelection} from '../ui/share';
import {MAX_HITS,registerSearch} from '../ui/search';
import {publishFact} from '../ui/summary';
import {rank} from '../../shared/search';
// Useful places, starting with food hygiene ratings. The bundle is built by `npm run data:hygiene` and
// loaded only when the layer is first switched on.
const COLOURS={good:'#2f7d4f',fair:'#d19a1c',poor:'#b3372b',none:'#9aa19a'} as const;
const date=(d:string)=>d?new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}):'not given';
export function connectPlaces(map:Map){
 const section=document.createElement('section');section.className='environment-control places-control';
 section.innerHTML=`<label class="layer-row"><span><i>✚</i>Food hygiene ratings</span><input id="hygiene-layer" type="checkbox" role="switch"></label>
  <div class="departure-views hygiene-filters" role="group" aria-label="Which kind of food premises" hidden>${Object.entries(FOOD_TYPES).map(([id,label])=>`<button type="button" data-food-type="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div>
  <div class="departure-views hygiene-filters" role="group" aria-label="Lowest hygiene rating to show" hidden>${RATING_FILTERS.map(([id,label])=>`<button type="button" data-hygiene-filter="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div>
  <details class="hygiene-find" hidden><summary>Find a food business</summary><label class="stop-search">Name or postcode<input type="search" aria-label="Find a food business" placeholder="Café, RG1…"></label><div class="stop-results" aria-live="polite"></div></details>
  <small id="hygiene-summary">Food Standards Agency ratings · off until switched on</small>`;
 layerGroup('places').append(section);
 const toggle=section.querySelector<HTMLInputElement>('#hygiene-layer')!,summary=section.querySelector('#hygiene-summary')!,filters=[...section.querySelectorAll<HTMLElement>('.hygiene-filters')],find=section.querySelector<HTMLElement>('.hygiene-find')!;
 let bundle:HygieneBundle|undefined,loading:Promise<void>|undefined,kind:FoodTypeFilter='all',min:RatingFilter='all';
 const byId=new globalThis.Map<number,HygienePlace>();
 const open=(p:HygienePlace)=>{const rating=p[7],group=ratingGroup(rating),extract=bundle!.authorities.map(x=>x.extractDate).sort()[0]??'';
  detail(`<span class="pill">Food hygiene rating</span><h2>${escape(p[1])}</h2><p>${escape(bundle!.types[p[2]]??'')}<br>${escape(p[3])}${p[4]?`, ${escape(p[4])}`:''}</p>
   <p class="hygiene-rating ${group}"><strong>${/^[0-5]$/.test(rating)?`${rating} out of 5`:escape(RATING_TEXT[rating]??rating)}</strong>${/^[0-5]$/.test(rating)?` · ${escape(RATING_TEXT[rating])}`:''}</p>
   <dl><dt>Inspected</dt><dd>${escape(date(p[8]))}</dd></dl>${p[9]?'<p>A new rating is pending: the business has been inspected again, and the rating may change once it is published.</p>':''}
   <p class="explorer-note">The rating covers hygiene, the state of the premises and how food safety is managed on the day of inspection. It says nothing about the quality of the food. Council data as of ${escape(date(extract))}.</p>
   <a href="https://ratings.food.gov.uk/business/${p[0]}" target="_blank" rel="noopener">Full record on the FSA website</a><p class="explorer-note">Food Standards Agency data, Open Government Licence v3.0.</p>`);setSelection({kind:'food',id:String(p[0])});};
 const shown=()=>(bundle?.places??[]).filter(p=>foodMatches(bundle!.types[p[2]]??'',p[7],kind,min));
 const data=()=>({type:'FeatureCollection' as const,features:shown().map(p=>({type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[p[5],p[6]]},properties:{id:p[0],group:ratingGroup(p[7]),label:/^[0-5]$/.test(p[7])?p[7]:''}}))});
 // The ratings file is fetched once, either when the layer is first switched on or when search first needs it.
 let fetching:Promise<HygieneBundle>|undefined;
 const fetchBundle=()=>fetching??=(async()=>{
  const r=await fetch('/data/hygiene.json',{signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(r.status===404?'Ratings not built yet: run npm run data:hygiene':'Ratings unavailable');
  const data=await r.json() as HygieneBundle;for(const p of data.places)byId.set(p[0],p);bundle=data;
  // Customer-facing premises only, the same set All food shows, for the Food mode card.
  const food=data.places.filter(p=>foodCategory(data.types[p[2]]??'')!=='excluded-institutional'),count=(c:string)=>food.filter(p=>foodCategory(data.types[p[2]]??'')===c).length;
  publishFact('food',{total:food.length,restaurant:count('restaurant-cafe'),takeaway:count('takeaway'),pub:count('pub-bar'),rated5:food.filter(p=>p[7]==='5').length,authorityDate:date(data.authorities.map(a=>a.extractDate).sort()[0]??'')});
  return data;
 })().catch(e=>{fetching=undefined;throw e;});
 async function load(){
  summary.textContent='Loading ratings…';
  await fetchBundle();
  map.addSource('hygiene',{type:'geojson',data:data(),attribution:'Food Standards Agency · OGL 3.0'});
  const colour=['match',['get','group'],'good',COLOURS.good,'fair',COLOURS.fair,'poor',COLOURS.poor,COLOURS.none] as never;
  map.addLayer({id:'hygiene-points',type:'circle',source:'hygiene',minzoom:12,paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,2.5,16,5.5,18,8],'circle-color':colour,'circle-stroke-color':'#fffdf5','circle-stroke-width':1.2}});
  map.addLayer({id:'hygiene-labels',type:'symbol',source:'hygiene',minzoom:16,layout:{'text-field':['get','label'],'text-size':9,'text-font':['Noto Sans Regular'],'text-allow-overlap':true},paint:{'text-color':'#ffffff'}});
  map.on('click','hygiene-points',e=>{const p=byId.get(Number(e.features?.[0]?.properties.id));if(p)open(p);});
  map.on('mouseenter','hygiene-points',()=>{map.getCanvas().style.cursor='pointer';});map.on('mouseleave','hygiene-points',()=>{map.getCanvas().style.cursor='';});
  describe();
 }
 // Counts only customer-facing premises, so the numbers agree with what All food shows.
 function describe(){
  const food=bundle!.places.filter(p=>foodCategory(bundle!.types[p[2]]??'')!=='excluded-institutional'),extract=bundle!.authorities.map(a=>a.extractDate).sort()[0];
  const lead=kind==='all'&&min==='all'?`${food.length.toLocaleString()} food premises · ${food.filter(p=>ratingGroup(p[7])==='poor').length} rated 0 to 2`:`${shown().length.toLocaleString()} of ${food.length.toLocaleString()} food premises match`;
  summary.textContent=`${lead} · council data from ${date(extract)} · zoom in to see them`;
 }
 const show=()=>{const on=toggle.checked;for(const f of filters)f.hidden=!on||!bundle;find.hidden=!on||!bundle;for(const id of ['hygiene-points','hygiene-labels'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'visible':'none');};
 toggle.addEventListener('change',()=>{if(toggle.checked&&!loading){loading??=load().catch(e=>{loading=undefined;summary.textContent=e instanceof Error?e.message:'Ratings unavailable';toggle.checked=false;});void loading.then(show);}else show();});// In Food mode the filters and search are the point: the other groups fold away so they are in view, and come back on leaving.
 const group=layerGroup('places').closest('details')!,others=[...document.querySelectorAll<HTMLDetailsElement>('.layer-group')].filter(d=>d!==group);
 let remembered:boolean[]|undefined;
 const openForMode=()=>{if(currentMode()==='eat'){remembered??=others.map(d=>d.open);others.forEach(d=>d.open=false);group.open=true;}else if(remembered){others.forEach((d,i)=>d.open=remembered![i]);remembered=undefined;}};document.addEventListener('reading-mode',openForMode);map.on('remove',()=>document.removeEventListener('reading-mode',openForMode));openForMode();registerSwitch('hygiene',toggle);
 // Search: customer-facing premises (what All food shows) by name or postcode, whatever the Food filters say, from two
 // characters. Opening one switches the ratings on.
 registerSearch('food',async q=>{if(q.length<2)return [];const data=await fetchBundle();
  const food=data.places.filter(p=>foodCategory(data.types[p[2]]??'')!=='excluded-institutional');
  return rank(food,q,p=>[p[1],p[4]],p=>p[1],MAX_HITS).map(({item:p})=>({title:p[1],detail:`${/^[0-5]$/.test(p[7])?`Hygiene rating ${p[7]}`:RATING_TEXT[p[7]]??p[7]} · ${[p[3].split(',')[0]?.trim(),p[4]].filter(Boolean).join(', ')}`,
   open:()=>{if(!toggle.checked){toggle.checked=true;toggle.dispatchEvent(new Event('change'));}map.flyTo({center:[p[5],p[6]],zoom:17.5,pitch:45});void loading?.then(()=>open(p));}}));});
 // A shared link to a premises switches the ratings on, waits for them, then opens its card.
 onLinked('food',async(id,fly)=>{if(!toggle.checked){toggle.checked=true;toggle.dispatchEvent(new Event('change'));}await loading;const p=byId.get(Number(id));if(!p)return false;if(fly)map.flyTo({center:[p[5],p[6]],zoom:17.5,pitch:45});open(p);return true;});
 const search=find.querySelector('input')!,results=find.querySelector<HTMLElement>('.stop-results')!;
 // Each row is one choice at a time: a type, and a rating threshold.
 for(const row of filters)row.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.addEventListener('click',()=>{
  if(b.dataset.foodType)kind=b.dataset.foodType as FoodTypeFilter;else min=b.dataset.hygieneFilter as RatingFilter;
  row.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));(map.getSource('hygiene') as GeoJSONSource|undefined)?.setData(data());describe();search.dispatchEvent(new Event('input'));}));
 search.addEventListener('input',()=>{results.replaceChildren();const q=search.value.trim().toLowerCase();if(q.length<2||!bundle)return;
  const matches=shown().filter(p=>`${p[1]} ${p[4]}`.toLowerCase().includes(q)).slice(0,12);if(!matches.length)results.textContent=kind==='all'&&min==='all'?'No matching food premises in the area.':'No matching premises with these filters.';
  for(const p of matches){const b=document.createElement('button');b.textContent=`${p[1]} · ${/^[0-5]$/.test(p[7])?`rated ${p[7]}`:RATING_TEXT[p[7]]??p[7]}`;b.addEventListener('click',()=>{map.flyTo({center:[p[5],p[6]],zoom:17.5,pitch:45});open(p);});results.append(b);}});
}
