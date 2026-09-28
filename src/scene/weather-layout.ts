// Pure helpers for the weather effects, kept free of three.js so they can be unit tested.
// Local units are metres (x east, y north), matching shared/geo toLocal.
export const CLOUD_COLUMNS=12,CLOUD_ROWS=10,CLOUD_SLOTS=CLOUD_COLUMNS*CLOUD_ROWS,PUFFS_PER_CLOUD=5,MAX_DROPS=1500;
const EARTH=40_075_016.686;
export type CloudPuff={slot:number;x:number;y:number;z:number;radius:number};
function seeded(seed:number){let a=seed>>>0;return()=>{a=a+0x6d2b79f5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
// Fixed layout in field-normalised units. Each slot has a threshold, so a slot is drawn only when
// the reported cloud cover exceeds it: 30% cover draws roughly 30% of the slots.
export const CLOUD_LAYOUT=(()=>{const r=seeded(1871),slots=[] as {x:number;y:number;threshold:number;puffs:{dx:number;dy:number;dz:number;radius:number}[]}[];
 for(let s=0;s<CLOUD_SLOTS;s++){const puffs=[];for(let p=0;p<PUFFS_PER_CLOUD;p++){const a=r()*Math.PI*2,d=p?r()*.028:0;puffs.push({dx:Math.cos(a)*d,dy:Math.sin(a)*d*.7,dz:r()*.006,radius:.018+r()*.014});}
  slots.push({x:(s%CLOUD_COLUMNS+.15+r()*.7)/CLOUD_COLUMNS,y:(Math.floor(s/CLOUD_COLUMNS)+.15+r()*.7)/CLOUD_ROWS,threshold:(s+r())/CLOUD_SLOTS,puffs});}
 for(let i=slots.length-1;i>0;i--){const j=Math.floor(r()*(i+1)),t=slots[i].threshold;slots[i].threshold=slots[j].threshold;slots[j].threshold=t;}
 return slots;})();
export const visibleSlots=(cover:number)=>CLOUD_LAYOUT.filter(s=>s.threshold<Math.max(0,Math.min(1,cover))).length;
// Metres per CSS pixel at the view centre (MapLibre uses 512 px tiles).
export const metresPerPixel=(zoom:number,lat:number)=>EARTH*Math.cos(lat*Math.PI/180)/(512*2**zoom);
// The effects are sized from the visible view, not fixed metres, so clouds keep the same share of
// the screen at zoom 11 and zoom 18. u is roughly the view height in metres when looking straight down.
export function viewScale(zoom:number,lat:number,width:number,height:number){const mpp=metresPerPixel(zoom,lat),u=mpp*Math.max(1,height);return {u,field:mpp*Math.max(width,height,1)*2.6,cloudBase:u*.2};}
export const wrap01=(v:number)=>v-Math.floor(v);
// Meteorological wind direction is where the wind blows from; clouds drift the other way.
export const downwind=(from:number)=>{const a=from*Math.PI/180;return [-Math.sin(a),-Math.cos(a)] as const;};
export function cloudPuffs(cover:number,offset:readonly [number,number],centre:readonly [number,number],scale:ReturnType<typeof viewScale>){
 // Puffs swell a little as cover rises, so overcast reads as a continuous deck rather than separate clouds.
 const swell=.8+.45*Math.max(0,Math.min(1,cover)),out:CloudPuff[]=[];CLOUD_LAYOUT.forEach((s,slot)=>{if(s.threshold>=cover)return;const nx=wrap01(s.x-offset[0])-.5,ny=wrap01(s.y-offset[1])-.5;
  for(const p of s.puffs)out.push({slot,x:centre[0]+(nx+p.dx)*scale.field,y:centre[1]+(ny+p.dy)*scale.field,z:scale.cloudBase+p.dz*scale.field,radius:p.radius*swell*scale.field});});return out;}
// Accumulated precipitation over the model interval, as mm/h. Only this number decides whether rain is drawn.
export const rainRate=(mm:number,intervalSeconds:number)=>mm>0&&intervalSeconds>0?mm*3600/intervalSeconds:0;
export function dropCount(rate:number){return rate>0?Math.min(MAX_DROPS,Math.round(200+400*Math.log2(1+rate*4))):0;}
// A puff at height z appears over the ground point z*tan(pitch) further along the view direction.
// Puffs that would sit over the view centre are shrunk, so the place being looked at stays readable.
export function sightlineScale(p:{x:number;y:number;z:number},centre:readonly [number,number],bearing:number,pitch:number,u:number){
 const b=bearing*Math.PI/180,reach=p.z*Math.tan(Math.min(pitch,75)*Math.PI/180),d=Math.hypot(p.x+Math.sin(b)*reach-centre[0],p.y+Math.cos(b)*reach-centre[1]);
 const t=Math.max(0,Math.min(1,(d-u*.2)/(u*.35)));return .2+.8*t*t*(3-2*t);}
// Rain falls under the clouds nearest the view centre, so the drops land where people are looking.
export function rainCells<P extends {x:number;y:number}>(cells:P[],centre:readonly [number,number],u:number){const near=cells.filter(c=>Math.hypot(c.x-centre[0],c.y-centre[1])<u*1.2);return near.length?near:cells;}
