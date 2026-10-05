import {GROUP_TITLES,groupOrder,type SearchGroup} from '../../shared/search';
import {currentMode} from './modes';
import {escape} from './shell';
// The search box at the top of the panel. Each layer registers a provider for its own data once that data is ready, so
// nothing here fetches or holds map data; groups are ordered by the current mode.
export type SearchHit={title:string;detail?:string;open:()=>void};
type Provider=(query:string)=>SearchHit[]|Promise<SearchHit[]>;
const providers=new globalThis.Map<SearchGroup,Provider>();
/** Results shown per group before a "Show more" button; providers may return up to MAX_HITS. */
const SHOWN=4;
export const MAX_HITS=20;
let refresh:(()=>void)|undefined;
/** A layer offers its results here. Registering again replaces the provider, and an open result list is redrawn. */
export function registerSearch(group:SearchGroup,provider:Provider){providers.set(group,provider);refresh?.();}
export function connectSearch(){
 const input=document.querySelector<HTMLInputElement>('#search')!,results=document.querySelector<HTMLElement>('#search-results')!;
 let run=0,timer:ReturnType<typeof setTimeout>|undefined,expanded=new Set<SearchGroup>(),last='';
 const buttons=()=>[...results.querySelectorAll<HTMLButtonElement>('button')];
 async function search(){
  const q=input.value.trim(),id=++run;
  if(q!==last){expanded=new Set();last=q;}
  if(!q){results.hidden=true;results.replaceChildren();return;}
  // A slow provider (food premises load on the first search) must not hold back the others or answer a newer query.
  const groups=await Promise.all(groupOrder(currentMode()).map(async g=>{const p=providers.get(g);if(!p)return [g,[]] as const;
   try{return [g,(await p(q)).slice(0,MAX_HITS)] as const;}catch{return [g,[]] as const;}}));
  if(id!==run)return;
  results.replaceChildren();results.hidden=false;
  const found=groups.filter(([,hits])=>hits.length);
  if(!found.length){const p=document.createElement('p');p.className='search-empty';p.textContent=`Nothing on the map matches “${q}”. Search covers places, landmarks, bus routes, stops, food premises, fuel forecourts and river gauges.`;results.append(p);return;}
  for(const [g,hits] of found){
   const section=document.createElement('section');section.className='search-group';section.setAttribute('aria-label',GROUP_TITLES[g]);
   section.innerHTML=`<h3>${escape(GROUP_TITLES[g])}</h3>`;
   const shown=expanded.has(g)?hits:hits.slice(0,SHOWN);
   for(const hit of shown){const b=document.createElement('button');b.type='button';b.innerHTML=`${escape(hit.title)}${hit.detail?`<small>${escape(hit.detail)}</small>`:''}`;
    b.addEventListener('click',()=>{results.hidden=true;input.value=hit.title;last=hit.title;hit.open();});section.append(b);}
   if(shown.length<hits.length){const more=document.createElement('button');more.type='button';more.className='search-more';
    more.textContent=`Show ${hits.length-shown.length} more ${GROUP_TITLES[g].toLowerCase()}`;
    more.addEventListener('click',()=>{expanded.add(g);const at=shown.length;void search().then(()=>results.querySelector<HTMLElement>(`[aria-label="${GROUP_TITLES[g]}"]`)?.querySelectorAll<HTMLButtonElement>('button')[at]?.focus());});section.append(more);}
   results.append(section);
  }
 }
 refresh=()=>{if(!results.hidden&&input.value.trim())void search();};
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>void search(),120);});
 // Arrow keys move between results; Enter in the box opens the first one.
 input.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'){const first=buttons()[0];if(first){e.preventDefault();first.focus();}}
  else if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);void search().then(()=>buttons().find(b=>!b.classList.contains('search-more'))?.click());}
 });
 results.addEventListener('keydown',e=>{
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;const list=buttons(),i=list.indexOf(document.activeElement as HTMLButtonElement);if(i<0)return;
  e.preventDefault();if(e.key==='ArrowUp'&&i===0){input.focus();return;}list[Math.min(list.length-1,Math.max(0,i+(e.key==='ArrowDown'?1:-1)))].focus();
 });
 // A new mode reorders an open list.
 document.addEventListener('reading-mode',()=>refresh?.());
}
