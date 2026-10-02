import {MODES,MODE_IDS,initialMode,type ModeId,type ModeLayer} from '../../shared/modes';
// The chosen mode is settled before any live module starts, so the first requests already follow it.
const KEY='mini-reading-mode';
// Read lazily, so modules that import this can still be loaded outside a browser in tests.
let chosen:ModeId|undefined;
const mode=()=>chosen??=initialMode(location.search,remembered());
const switches=new globalThis.Map<ModeLayer,HTMLInputElement>();
function remembered(){try{return localStorage.getItem(KEY);}catch{return null;}}
/** Whether the current mode starts a layer switched on; the shell uses it to draw switches before their modules load. */
export const modeDefault=(layer:ModeLayer)=>MODES[mode()].layers[layer];
const set=(input:HTMLInputElement,on:boolean)=>{if(input.disabled||input.checked===on)return;input.checked=on;input.dispatchEvent(new Event('change'));};
/** A module calls this once its switch is enabled and its change handler wired. The switch is moved to the current
 * mode's setting straight away and on every later mode change; the viewer can still flip it by hand. */
export function registerSwitch(layer:ModeLayer,input:HTMLInputElement){switches.set(layer,input);set(input,modeDefault(layer));}
export function setMode(id:ModeId){
 chosen=id;
 try{localStorage.setItem(KEY,id);}catch{/* private mode: the choice lasts for this visit */}
 const url=new URL(location.href);url.searchParams.set('mode',id);history.replaceState(history.state,'',url);
 for(const [layer,input] of switches)set(input,MODES[id].layers[layer]);
 showMode();document.dispatchEvent(new CustomEvent('reading-mode',{detail:id}));
}
export const modeBar=()=>`<div class="mode-bar" role="group" aria-label="Map mode">${MODE_IDS.map(id=>`<button type="button" data-mode="${id}" aria-pressed="${id===mode()}" title="${MODES[id].summary}"><span aria-hidden="true">${MODES[id].icon}</span>${MODES[id].label}</button>`).join('')}</div><p id="mode-summary" class="mode-summary${mode()==='lab'?' lab':''}">${MODES[mode()].summary}</p>`;
function showMode(){
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode()));
 const summary=document.querySelector<HTMLElement>('#mode-summary')!;summary.textContent=MODES[mode()].summary;summary.classList.toggle('lab',mode()==='lab');
}
export function connectModeBar(){for(const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))b.addEventListener('click',()=>{if(b.dataset.mode!==mode())setMode(b.dataset.mode as ModeId);});}
