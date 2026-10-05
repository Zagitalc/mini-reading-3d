import {BOUNDS} from './config';
import type {LngLat} from './types';
// "Share this view": the address bar carries the mode, the camera and the card open in the details panel, so a copied
// link opens the same view. Selections use ids that survive a timetable refresh: bus routes and rail corridors by their
// label (the internal route ids come from the BODS feed and have changed before), stops by ATCO code, food premises by
// FSA id, landmarks by their id in shared/config.ts.
export const SELECTION_KINDS=['route','rail','stop','food','landmark'] as const;
export type SelectionKind=typeof SELECTION_KINDS[number];
export type Selection={kind:SelectionKind;id:string};
export type Camera={center:LngLat;zoom:number;pitch:number;bearing:number};
/** The map's own limits: zoom 11 to 19, pitch up to 70. */
export const CAMERA_LIMITS={minZoom:11,maxZoom:19,maxPitch:70} as const;
const CAMERA_KEYS=['lat','lng','zoom','pitch','bearing'] as const;
const number=(v:string|null)=>v===null||v.trim()===''?NaN:Number(v);
/** Reads a camera from the address. All of lat, lng and zoom must be present and inside the map; pitch and bearing
 * default to a flat, north-up view. Anything out of range gives undefined, so a bad link opens the usual view. */
export function parseCamera(search:string):Camera|undefined {
 const q=new URLSearchParams(search),lat=number(q.get('lat')),lng=number(q.get('lng')),zoom=number(q.get('zoom'));
 if(![lat,lng,zoom].every(Number.isFinite))return undefined;
 if(lng<BOUNDS[0]||lng>BOUNDS[2]||lat<BOUNDS[1]||lat>BOUNDS[3])return undefined;
 if(zoom<CAMERA_LIMITS.minZoom||zoom>CAMERA_LIMITS.maxZoom)return undefined;
 const pitch=q.has('pitch')?number(q.get('pitch')):0,bearing=q.has('bearing')?number(q.get('bearing')):0;
 if(!Number.isFinite(pitch)||pitch<0||pitch>CAMERA_LIMITS.maxPitch||!Number.isFinite(bearing)||Math.abs(bearing)>360)return undefined;
 return {center:[lng,lat],zoom,pitch,bearing};
}
/** The first selection in the address, in SELECTION_KINDS order. Values are trimmed and capped; the module that owns
 * the kind decides whether the id exists. */
export function parseSelection(search:string):Selection|undefined {
 const q=new URLSearchParams(search);
 for(const kind of SELECTION_KINDS){const id=q.get(kind)?.trim();if(id&&id.length<=80)return {kind,id};}
 return undefined;
}
/** A new address for the same page: mode, camera and selection replaced, every other parameter (city=…, say) kept. */
export function viewSearch(search:string,view:{mode:string;camera?:Camera;selection?:Selection}):string {
 const q=new URLSearchParams(search);
 q.set('mode',view.mode);
 for(const k of CAMERA_KEYS)q.delete(k);
 if(view.camera){const c=view.camera;
  q.set('lat',c.center[1].toFixed(5));q.set('lng',c.center[0].toFixed(5));q.set('zoom',String(Math.round(c.zoom*100)/100));
  q.set('pitch',String(Math.round(c.pitch)));q.set('bearing',String(Math.round(((c.bearing+540)%360)-180)));}
 for(const k of SELECTION_KINDS)q.delete(k);
 if(view.selection)q.set(view.selection.kind,view.selection.id);
 const s=q.toString();return s?`?${s}`:'';
}
/** Labels such as "19a" match whatever case the link was typed in. */
export const sameLabel=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
