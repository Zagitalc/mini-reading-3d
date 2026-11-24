import {MODES} from '../../shared/modes';
import {currentMode} from './modes';

const compactQuery='(max-width: 800px), (max-width: 1000px) and (max-height: 500px) and (pointer: coarse)';

const find=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
export const isCompactMap=()=>matchMedia(compactQuery).matches;

export function closeMapMenu(restoreFocus=false){
 const menu=find<HTMLElement>('map-menu');
 const open=menu.classList.contains('mobile-open');
 menu.classList.remove('mobile-open');
 const toggle=find('mobile-menu-toggle');
 toggle.setAttribute('aria-expanded','false');
 toggle.textContent='Menu';
 find('mobile-mode').setAttribute('aria-expanded','false');
 if(open&&restoreFocus)toggle.focus({preventScroll:true});
}

function expandDetails(expanded:boolean){
 const panel=find('details'),handle=find('sheet-handle');
 panel.classList.toggle('expanded',expanded);
 handle.setAttribute('aria-expanded',String(expanded));
 handle.setAttribute('aria-label',expanded?'Show less of the panel':'Show more of the panel');
}

export const resetDetailsSheet=()=>expandDetails(false);

interface HandleActions {
 tap:()=>void;
 preview?:(distance:number)=>void;
 drag:(distance:number)=>void;
}

function connectHandle(handle:HTMLElement,actions:HandleActions){
 let pointer:{id:number;y:number;moved:boolean}|undefined;
 let dragged=false;
 handle.addEventListener('click',event=>{
  if(!dragged||event.detail===0)actions.tap();
  dragged=false;
 });
 handle.addEventListener('pointerdown',event=>{
  if(!isCompactMap()||!event.isPrimary||event.button!==0)return;
  dragged=false;
  pointer={id:event.pointerId,y:event.clientY,moved:false};
  handle.setPointerCapture(event.pointerId);
 });
 handle.addEventListener('pointermove',event=>{
  if(pointer?.id!==event.pointerId)return;
  const distance=event.clientY-pointer.y;
  if(Math.abs(distance)>=9)pointer.moved=true;
  if(pointer.moved)actions.preview?.(distance);
 });
 handle.addEventListener('pointerup',event=>{
  if(pointer?.id!==event.pointerId)return;
  const distance=event.clientY-pointer.y;
  dragged=pointer.moved||Math.abs(distance)>=9;
  pointer=undefined;
  actions.preview?.(0);
  if(dragged)actions.drag(distance);
 });
 const cancel=(event:PointerEvent)=>{
  if(pointer?.id!==event.pointerId)return;
  pointer=undefined;
  dragged=true;
  actions.preview?.(0);
 };
 handle.addEventListener('pointercancel',cancel);
 handle.addEventListener('lostpointercapture',cancel);
}

export function connectMapSheets(cancelPick:()=>boolean){
 const menu=find('map-menu'),toggle=find('mobile-menu-toggle'),details=find('details');
 const search=find<HTMLInputElement>('search'),searchResults=find('search-results');
 const menuContent=menu.querySelector<HTMLElement>('.map-menu-content')!;
 const closeDetails=(restoreFocus=false)=>{
  if(details.hidden)return;
  details.hidden=true;
  resetDetailsSheet();
  if(restoreFocus&&isCompactMap())toggle.focus({preventScroll:true});
 };
 const openMenu=(focusSearch=false)=>{
  if(!isCompactMap())return;
  closeDetails();
  menu.classList.add('mobile-open');
  toggle.setAttribute('aria-expanded','true');
  toggle.textContent='Close';
  find('mobile-mode').setAttribute('aria-expanded','true');
  menuContent.scrollTop=0;
  (focusSearch?search:find('mobile-menu-title')).focus({preventScroll:true});
  if(focusSearch)search.select();
 };
 toggle.addEventListener('click',()=>menu.classList.contains('mobile-open')?closeMapMenu(true):openMenu());
 const mode=find('mobile-mode');
 const updateMode=()=>{mode.textContent=MODES[currentMode()].label;};
 updateMode();
 find('mobile-search').addEventListener('click',()=>openMenu(true));
 mode.addEventListener('click',()=>openMenu());
 find('close-map-menu').addEventListener('click',()=>closeMapMenu(true));
 find('close-details').addEventListener('click',()=>closeDetails(true));
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||event.defaultPrevented)return;
  if(cancelPick())return;
  if(!searchResults.hidden){
   searchResults.hidden=true;
   if(searchResults.contains(document.activeElement))search.focus();
  }else if(!details.hidden){
   closeDetails(true);
  }else{
   closeMapMenu(true);
  }
 });
 document.addEventListener('reading-mode',()=>{updateMode();closeMapMenu(true);});
 for(const id of ['home-view','overview','orbit-view'])find(id).addEventListener('click',()=>closeMapMenu(true));

 const preview=(panel:HTMLElement,distance:number)=>panel.style.setProperty('--sheet-drag',Math.max(0,distance)+'px');
 connectHandle(find('menu-handle'),{
  tap:()=>closeMapMenu(true),
  drag:distance=>{if(distance>40)closeMapMenu(true);},
  preview:distance=>preview(menu,distance),
 });
 connectHandle(find('sheet-handle'),{
  tap:()=>expandDetails(!details.classList.contains('expanded')),
  preview:distance=>preview(details,distance),
  drag:dy=>{
   if(dy< -40)expandDetails(true);
   else if(dy>40){
    if(details.classList.contains('expanded'))resetDetailsSheet();
    else closeDetails(true);
   }
  },
 });

 // Move the actual controls so their IDs, listeners and current values survive rotation and resize.
 function moveOnCompact(element:HTMLElement,target:HTMLElement){
  const anchor=document.createComment('Desktop position for '+element.id);
  element.before(anchor);
  return (compact:boolean)=>{if(compact)target.append(element);else anchor.after(element);};
 }
 const extras=find('mobile-map-extras'),landmarks=document.querySelector<HTMLElement>('.places-dock')!;
 const relocate=[
  moveOnCompact(landmarks,find('mobile-landmark-slot')),
  ...['home-view','overview','orbit-view','data-button'].map(id=>moveOnCompact(find(id),extras)),
 ];
 const media=matchMedia(compactQuery);
 const syncLayout=()=>{
  const compact=media.matches;
  document.body.classList.toggle('compact-map',compact);
  closeMapMenu();
  const layers=find('layers'),layerToggle=find('collapse-layers');
  layers.hidden=compact;
  layerToggle.textContent=compact?'+':'−';
  layerToggle.setAttribute('aria-expanded',String(!compact));
  for(const move of relocate)move(compact);
 };
 syncLayout();
 media.addEventListener('change',syncLayout);
}
