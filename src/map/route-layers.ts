import type {Map,ExpressionSpecification} from 'maplibre-gl';
import {detail,escape} from '../ui/shell';
import {routeMatches,uniqueRoutes,mapRouteLabel,type StaticRoute} from '../../shared/static-routes';
export async function connectRouteLayers(map:Map){
 const groups:{mode:string;routes:StaticRoute[];selected:string;enabled:boolean}[]=[];
 for(const [mode,title,file] of [['bus','Bus routes','bus-routes'],['rail','Train routes','rail-corridors']]){
  const section=document.createElement('section');section.className='route-control';
  section.innerHTML=`<label class="layer-row"><span><i>${mode==='bus'?'⌁':'╫'}</i>${title}</span><input type="checkbox" data-route-layer="${mode}" role="switch" disabled></label><div class="route-options" hidden><label>Find ${mode==='bus'?'a route':'a corridor'}<input type="search" aria-label="Search ${title.toLowerCase()}" placeholder="${mode==='bus'?'Number or destination':'Corridor name'}"></label><button class="route-reset">All routes</button><select size="4" aria-label="${title} selector"></select><small>${mode==='rail'?'Infrastructure corridors, not train services.':'Snapshot routes, including timetable variants.'}</small></div><small class="route-loading">Loading route snapshot…</small>`;
  document.querySelector('#layers')!.insertBefore(section,document.querySelector('[data-layer=traffic]')!.closest('label'));
  try{
   const response=await fetch(`/data/${file}.json`);if(!response.ok)throw Error('Missing snapshot');
   const routes:StaticRoute[]=await response.json();routes.sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
   const group={mode,routes,selected:'',enabled:false};groups.push(group);
   map.addSource(`${mode}-routes`,{type:'geojson',data:{type:'FeatureCollection',features:routes.map(r=>({type:'Feature',geometry:{type:'MultiLineString',coordinates:r.coordinates},properties:{id:r.id,label:mapRouteLabel(r.label),colour:r.colour}}))}});
   const before='traffic-lines';
   map.addLayer({id:`${mode}-route-outline`,type:'line',source:`${mode}-routes`,layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':'#fbfaf4','line-width':7,'line-opacity':.9}},before);
   map.addLayer({id:`${mode}-route-lines`,type:'line',source:`${mode}-routes`,layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':['get','colour'],'line-width':3.5,'line-opacity':.9}},before);
   map.addLayer({id:`${mode}-route-labels`,type:'symbol',source:`${mode}-routes`,minzoom:13,layout:{visibility:'none','symbol-placement':'line','text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':11,'symbol-spacing':280},paint:{'text-color':['get','colour'],'text-halo-color':'#fffdf7','text-halo-width':2}},before);
   const select=section.querySelector('select')!,search=section.querySelector<HTMLInputElement>('input[type=search]')!,toggle=section.querySelector<HTMLInputElement>('input[type=checkbox]')!;
   const list=()=>{select.replaceChildren();const all=new Option('All routes','');select.append(all);for(const r of routes.filter(r=>routeMatches(r,search.value)))select.append(new Option(`${r.label}${r.operator?' · '+r.operator:''}`,r.id));select.value=group.selected;};
   const choose=(id:string)=>{
    group.selected=id;select.value=id;if(mode==='bus')document.dispatchEvent(new CustomEvent('reading-bus-route',{detail:group.enabled?id:''}));
    const opacity:ExpressionSpecification=['case',['any',['literal',!id],['==',['get','id'],id]],.95,.13];
    for(const part of ['outline','lines'])map.setPaintProperty(`${mode}-route-${part}`,'line-opacity',opacity);
    map.setPaintProperty(`${mode}-route-labels`,'text-opacity',opacity);
    const r=routes.find(r=>r.id===id);if(!r)return;
    detail(`<span class="pill">${mode==='bus'?'Bus route':'Railway infrastructure corridor'}</span><h2>${escape(r.label)}</h2>${mode==='rail'?'<p>Physical railway corridor. This does not establish passenger services or operator coverage.</p>':''}<dl>${r.operator?`<dt>Operator</dt><dd>${escape(r.operator)}</dd>`:''}<dt>${mode==='bus'?'Available destinations':'Mapped endpoints'}</dt><dd>${r.destinations.map(escape).join('<br>')||'Not supplied'}</dd><dt>Source</dt><dd><a href="${escape(r.sourceUrl)}" target="_blank" rel="noopener">${escape(r.source)}</a></dd><dt>Snapshot</dt><dd>${escape(r.snapshot.slice(0,10))}</dd><dt>Colour</dt><dd>${escape(r.colourSource)}</dd></dl>`);
   };
   Object.assign(group,{choose});
   if(mode==='bus'){const show=(e:Event)=>{toggle.checked=true;toggle.dispatchEvent(new Event('change'));choose((e as CustomEvent<string>).detail);};document.addEventListener('reading-show-bus-route',show);map.on('remove',()=>document.removeEventListener('reading-show-bus-route',show));}
   search.addEventListener('input',list);select.addEventListener('change',()=>choose(select.value));section.querySelector('button')!.addEventListener('click',()=>{search.value='';list();choose('');});list();
   toggle.disabled=false;section.querySelector('.route-loading')!.remove();toggle.addEventListener('change',()=>{group.enabled=toggle.checked;if(mode==='bus')document.dispatchEvent(new CustomEvent('reading-bus-route',{detail:group.enabled?group.selected:''}));section.querySelector<HTMLElement>('.route-options')!.hidden=!toggle.checked;for(const part of ['outline','lines','labels'])map.setLayoutProperty(`${mode}-route-${part}`,'visibility',toggle.checked?'visible':'none');});
  }catch{section.querySelector('.route-loading')!.textContent='Route snapshot unavailable';}
 }
 map.on('click',e=>{
  const layers=groups.filter(g=>g.enabled).map(g=>`${g.mode}-route-lines`);if(!layers.length)return;
  const hits=map.queryRenderedFeatures([[e.point.x-6,e.point.y-6],[e.point.x+6,e.point.y+6]],{layers});
  const ids=uniqueRoutes(hits.map(f=>`${f.source}:${f.properties.id}`));
  const choices=groups.flatMap(g=>g.routes.filter(r=>ids.includes(`${g.mode}-routes:${r.id}`)).map(r=>({g,r})));
  if(!choices.length)return;
  const select=(c:typeof choices[number])=>(c.g as typeof c.g & {choose:(id:string)=>void}).choose(c.r.id);
  if(choices.length===1){select(choices[0]);return;}
  detail('<span class="pill">Overlapping routes</span><h2>Choose a route</h2><div id="route-choices" class="route-choices"></div>');
  for(const c of choices){const b=document.createElement('button');b.textContent=`${c.g.mode==='bus'?'Bus':'Rail'} · ${c.r.label}`;b.style.borderLeft=`5px solid ${c.r.colour}`;b.addEventListener('click',()=>select(c));document.querySelector('#route-choices')!.append(b);}
 });
}
