import type {Map} from 'maplibre-gl';
import {parseCamera,parseSelection,viewSearch,type Camera,type Selection,type SelectionKind} from '../../shared/share-view';
import {currentMode} from './modes';
// Keeps the address bar in step with the view (mode, camera, open card) and opens whatever a shared link names.
// It imports nothing from the shell, so the shell can clear the selection whenever it replaces the details panel.
let selection:Selection|undefined,map:Map|undefined,notify:(text:string)=>void=()=>{},timer:ReturnType<typeof setTimeout>|undefined;
// Read once, from the address the page opened with; later changes are our own. Lazily, so modules that import this can
// still be loaded outside a browser in tests.
let opened:{camera?:Camera;selection?:Selection}|undefined;
const link=()=>opened??={camera:parseCamera(location.search),selection:parseSelection(location.search)};
const NOT_FOUND:Record<SelectionKind,string>={route:'That bus route',rail:'That rail corridor',stop:'That bus stop',food:'That food business',landmark:'That landmark'};
/** The camera named in the address the page was opened with, if it is a valid view inside the map. */
export const linkedCamera=()=>link().camera;
export const currentSelection=()=>selection;
const camera=():Camera|undefined=>map&&{center:map.getCenter().toArray() as [number,number],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()};
function write(){
 clearTimeout(timer);timer=undefined;
 const url=new URL(location.href);url.search=viewSearch(location.search,{mode:currentMode(),camera:camera(),selection});
 if(url.href!==location.href)history.replaceState(history.state,'',url);
}
// Browsers limit how often the address may change (Safari allows about a hundred changes in ten seconds), and orbiting
// moves the camera every frame, so camera writes wait until the view has been still briefly.
const later=()=>{clearTimeout(timer);timer=setTimeout(write,400);};
/** Called by a module after it fills the details panel with something a link can reopen. */
export function setSelection(next:Selection|undefined){selection=next;if(map)write();}
/** The shell calls this whenever the details panel is replaced or closed. */
export function clearSelection(){if(selection)setSelection(undefined);}
/** A module that can reopen a card registers here once its data is ready. If the page was opened with a link to one of
 * this module's cards, `open` runs once; `fly` is false when the link also fixed the camera. Return false when the id
 * is not in the current data, and the viewer is told. */
export function onLinked(kind:SelectionKind,open:(id:string,fly:boolean)=>boolean|Promise<boolean>){
 const linked=link(),s=linked.selection;if(s?.kind!==kind)return;linked.selection=undefined;
 void Promise.resolve().then(()=>open(s.id,!linked.camera)).catch(()=>false).then(found=>{if(!found)notify(`${NOT_FOUND[kind]} in this link is not in the current data.`);});
}
async function share(){
 write();const url=location.href;
 // Phones get the system share sheet; elsewhere, and if the sheet is dismissed or missing, the link is copied.
 if(matchMedia('(pointer:coarse)').matches&&navigator.share){try{await navigator.share({title:document.title,url});return;}catch(e){if((e as DOMException)?.name==='AbortError')return;}}
 try{await navigator.clipboard.writeText(url);notify(selection?'Link copied. It opens this mode, this view and the open card.':'Link copied. It opens this mode and this view.');}
 catch{notify('Copy the address bar to share this view.');}
}
/** Starts writing the view into the address and wires the Share button. Call once the map exists. */
export function connectShare(m:Map,tell:(text:string)=>void){
 map=m;notify=tell;
 m.on('moveend',later);document.addEventListener('reading-mode',later);
 // Closing the panel (×, Escape, or a phone's sheet) drops the card from the link.
 const details=document.querySelector<HTMLElement>('#details')!;
 new MutationObserver(()=>{if(details.hidden)clearSelection();}).observe(details,{attributes:true,attributeFilter:['hidden']});
 document.querySelector('#share-view')!.addEventListener('click',()=>void share());
 m.on('remove',()=>{clearTimeout(timer);m.off('moveend',later);document.removeEventListener('reading-mode',later);});
}
