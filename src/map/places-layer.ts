import type {Map,GeoJSONSource} from 'maplibre-gl';
import {RATING_TEXT,ratingGroup,type HygieneBundle,type HygienePlace} from '../../shared/hygiene';
import {detail,escape} from '../ui/shell';
// Useful places, starting with food hygiene ratings. The bundle is built by `npm run data:hygiene` and
// loaded only when the layer is first switched on.
const COLOURS={good:'#2f7d4f',fair:'#d19a1c',poor:'#b3372b',none:'#9aa19a'} as const;
const FILTERS={all:'All',good:'Rated 4 or 5',poor:'Rated 0 to 2'} as const;
const date=(d:string)=>d?new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}):'not given';
export function connectPlaces(map:Map){
 const section=document.createElement('section');section.className='environment-control places-control';
 section.innerHTML=`<div class="layer-title">Useful places</div><label class="layer-row"><span><i>✚</i>Food hygiene ratings</span><input id="hygiene-layer" type="checkbox" role="switch"></label>
  <div class="departure-views hygiene-filters" role="group" aria-label="Which ratings to show" hidden>${Object.entries(FILTERS).map(([id,label])=>`<button type="button" data-hygiene-filter="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div>
  <details class="hygiene-find" hidden><summary>Find a food business</summary><label class="stop-search">Name or postcode<input type="search" aria-label="Find a food business" placeholder="Café, RG1…"></label><div class="stop-results" aria-live="polite"></div></details>
  <small id="hygiene-summary">Food Standards Agency ratings · off until switched on</small>`;
 document.querySelector('#layers')!.append(section);
 const toggle=section.querySelector<HTMLInputElement>('#hygiene-layer')!,summary=section.querySelector('#hygiene-summary')!,filters=section.querySelector<HTMLElement>('.hygiene-filters')!,find=section.querySelector<HTMLElement>('.hygiene-find')!;
 let bundle:HygieneBundle|undefined,loading:Promise<void>|undefined,filter:keyof typeof FILTERS='all';
 const byId=new globalThis.Map<number,HygienePlace>();
 const open=(p:HygienePlace)=>{const rating=p[7],group=ratingGroup(rating),extract=bundle!.authorities.map(x=>x.extractDate).sort()[0]??'';
  detail(`<span class="pill">Food hygiene rating</span><h2>${escape(p[1])}</h2><p>${escape(bundle!.types[p[2]]??'')}<br>${escape(p[3])}${p[4]?`, ${escape(p[4])}`:''}</p>
   <p class="hygiene-rating ${group}"><strong>${/^[0-5]$/.test(rating)?`${rating} out of 5`:escape(RATING_TEXT[rating]??rating)}</strong>${/^[0-5]$/.test(rating)?` · ${escape(RATING_TEXT[rating])}`:''}</p>
   <dl><dt>Inspected</dt><dd>${escape(date(p[8]))}</dd></dl>${p[9]?'<p>A new rating is pending: the business has been inspected again, and the rating may change once it is published.</p>':''}
   <p class="explorer-note">The rating covers hygiene, the state of the premises and how food safety is managed on the day of inspection. It says nothing about the quality of the food. Council data as of ${escape(date(extract))}.</p>
   <a href="https://ratings.food.gov.uk/business/${p[0]}" target="_blank" rel="noopener">Full record on the FSA website</a><p class="explorer-note">Food Standards Agency data, Open Government Licence v3.0.</p>`);};
 const data=()=>({type:'FeatureCollection' as const,features:(bundle?.places??[]).filter(p=>{const g=ratingGroup(p[7]);return filter==='all'||g===filter;}).map(p=>({type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[p[5],p[6]]},properties:{id:p[0],group:ratingGroup(p[7]),label:/^[0-5]$/.test(p[7])?p[7]:''}}))});
 async function load(){
  summary.textContent='Loading ratings…';
  const r=await fetch('/data/hygiene.json',{signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(r.status===404?'Ratings not built yet: run npm run data:hygiene':'Ratings unavailable');
  bundle=await r.json() as HygieneBundle;for(const p of bundle.places)byId.set(p[0],p);
  map.addSource('hygiene',{type:'geojson',data:data(),attribution:'Food Standards Agency · OGL 3.0'});
  const colour=['match',['get','group'],'good',COLOURS.good,'fair',COLOURS.fair,'poor',COLOURS.poor,COLOURS.none] as never;
  map.addLayer({id:'hygiene-points',type:'circle',source:'hygiene',minzoom:12,paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,2.5,16,5.5,18,8],'circle-color':colour,'circle-stroke-color':'#fffdf5','circle-stroke-width':1.2}});
  map.addLayer({id:'hygiene-labels',type:'symbol',source:'hygiene',minzoom:16,layout:{'text-field':['get','label'],'text-size':9,'text-font':['Noto Sans Regular'],'text-allow-overlap':true},paint:{'text-color':'#ffffff'}});
  map.on('click','hygiene-points',e=>{const p=byId.get(Number(e.features?.[0]?.properties.id));if(p)open(p);});
  map.on('mouseenter','hygiene-points',()=>{map.getCanvas().style.cursor='pointer';});map.on('mouseleave','hygiene-points',()=>{map.getCanvas().style.cursor='';});
  const count=(g:string)=>bundle!.places.filter(p=>ratingGroup(p[7])===g).length,extract=bundle.authorities.map(a=>a.extractDate).sort()[0];
  summary.textContent=`${bundle.places.length.toLocaleString()} premises · ${count('poor')} rated 0 to 2 · council data from ${date(extract)} · zoom in to see them`;
 }
 const show=()=>{const on=toggle.checked;filters.hidden=!on||!bundle;find.hidden=!on||!bundle;for(const id of ['hygiene-points','hygiene-labels'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'visible':'none');};
 toggle.addEventListener('change',()=>{if(toggle.checked&&!bundle){loading??=load().catch(e=>{loading=undefined;summary.textContent=e instanceof Error?e.message:'Ratings unavailable';toggle.checked=false;});void loading.then(show);}else show();});
 filters.querySelectorAll<HTMLButtonElement>('[data-hygiene-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.hygieneFilter as keyof typeof FILTERS;filters.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));(map.getSource('hygiene') as GeoJSONSource|undefined)?.setData(data());}));
 const search=find.querySelector('input')!,results=find.querySelector<HTMLElement>('.stop-results')!;
 search.addEventListener('input',()=>{results.replaceChildren();const q=search.value.trim().toLowerCase();if(q.length<2||!bundle)return;
  const matches=bundle.places.filter(p=>`${p[1]} ${p[4]}`.toLowerCase().includes(q)).slice(0,12);if(!matches.length)results.textContent='No matching premises in the area.';
  for(const p of matches){const b=document.createElement('button');b.textContent=`${p[1]} · ${/^[0-5]$/.test(p[7])?`rated ${p[7]}`:RATING_TEXT[p[7]]??p[7]}`;b.addEventListener('click',()=>{map.flyTo({center:[p[5],p[6]],zoom:17.5,pitch:45});open(p);});results.append(b);}});
}
