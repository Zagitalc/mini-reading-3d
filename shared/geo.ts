import { BOUNDS, ORIGIN } from './config';
import type { Bounds, LngLat } from './types';
const R=6378137;
export function validPosition(p:unknown):p is LngLat{return Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;}
export function inBounds(p:LngLat,b:Bounds=BOUNDS){return validPosition(p)&&p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3];}
export function intersects(a:Bounds,b:Bounds){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
export function boundsOf(ps:LngLat[]):Bounds{return [Math.min(...ps.map(p=>p[0])),Math.min(...ps.map(p=>p[1])),Math.max(...ps.map(p=>p[0])),Math.max(...ps.map(p=>p[1]))];}
// Local east/north metres using Mercator deltas, exact relative to the custom-layer origin.
const mx=(p:LngLat)=>[R*p[0]*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+p[1]*Math.PI/360))];
const base=mx(ORIGIN), scale=Math.cos(ORIGIN[1]*Math.PI/180);
export function toLocal(p:LngLat):LngLat{const q=mx(p);return [(q[0]-base[0])*scale,(q[1]-base[1])*scale];}
export function fromLocal(p:LngLat):LngLat{return [(p[0]/scale+base[0])/R*180/Math.PI,(2*Math.atan(Math.exp((p[1]/scale+base[1])/R))-Math.PI/2)*180/Math.PI];}
export function distance(a:LngLat,b:LngLat){const x=toLocal(a),y=toLocal(b);return Math.hypot(x[0]-y[0],x[1]-y[1]);}
export function bearing(a:LngLat,b:LngLat){const x=toLocal(a),y=toLocal(b);return (Math.atan2(y[0]-x[0],y[1]-x[1])*180/Math.PI+360)%360;}
export function interpolate(a:LngLat,b:LngLat,t:number):LngLat{return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
const projectedLines=new WeakMap<LngLat[],LngLat[]>();
export function nearestOnLine(p:LngLat,line:LngLat[]){
 let points=projectedLines.get(line);if(!points){points=line.map(toLocal);projectedLines.set(line,points);}
 let best={position:line[0]??p,distance:Infinity,along:0,segment:0},run=0;const q=toLocal(p);
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),t=len?Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/(len*len))):0,d=Math.hypot(q[0]-a[0]-dx*t,q[1]-a[1]-dy*t);if(d<best.distance)best={position:interpolate(line[i-1],line[i],t),distance:d,along:run+len*t,segment:i-1};run+=len;}
 return best;
}
export function alongLine(line:LngLat[],metres:number):LngLat{let run=0;for(let i=1;i<line.length;i++){const d=distance(line[i-1],line[i]);if(run+d>=metres&&d)return interpolate(line[i-1],line[i],Math.max(0,(metres-run)/d));run+=d;}return line.at(-1)!;}
export function lineLength(line:LngLat[]){return line.slice(1).reduce((sum,p,i)=>sum+distance(line[i],p),0);}
export function geometryIntersects(points:LngLat[],b:Bounds=BOUNDS){if(points.some(p=>inBounds(p,b)))return true;for(let i=1;i<points.length;i++){let t0=0,t1=1;const [x,y]=points[i-1],dx=points[i][0]-x,dy=points[i][1]-y;let hit=true;for(const [p,q] of [[-dx,x-b[0]],[dx,b[2]-x],[-dy,y-b[1]],[dy,b[3]-y]]){if(p===0){if(q<0){hit=false;break;}}else {const r=q/p;if(p<0)t0=Math.max(t0,r);else t1=Math.min(t1,r);if(t0>t1){hit=false;break;}}}if(hit)return true;}return false;}
