import * as T from 'three';
import {toLocal} from '../../shared/geo';
import {SKYLINE,type SkylineLandmark} from '../../shared/skyline';

const BASE=.12;
type Point=[number,number];

// Unit vector along the longest edge, flipped to point west, and the footprint's extent along it and across it.
function orientation(ring:Point[]){
 let angle=0,longest=0;
 for(let i=1;i<ring.length;i++){const d=Math.hypot(ring[i][0]-ring[i-1][0],ring[i][1]-ring[i-1][1]);if(d>longest){longest=d;angle=Math.atan2(ring[i][1]-ring[i-1][1],ring[i][0]-ring[i-1][0]);}}
 let ux=Math.cos(angle),uy=Math.sin(angle);if(ux>0){ux=-ux;uy=-uy;}
 const along=ring.map(p=>p[0]*ux+p[1]*uy),across=ring.map(p=>-p[0]*uy+p[1]*ux);
 return {ux,uy,min:Math.min(...along),max:Math.max(...along),lo:Math.min(...across),hi:Math.max(...across)};
}

function glassTexture(){
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const c=canvas.getContext('2d')!;
 c.fillStyle='#9fb6ba';c.fillRect(0,0,64,64);c.fillStyle='#66848c';c.fillRect(0,10,64,34);c.fillStyle='#d6dcd8';c.fillRect(0,0,64,3);c.fillRect(0,0,3,64);
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(.06,.3);return texture;
}

export function createSkyline(){
 const root=new T.Group(),mats=new Map<string,T.MeshLambertMaterial>();
 const mat=(color:string)=>{if(!mats.has(color))mats.set(color,new T.MeshLambertMaterial({color}));return mats.get(color)!;};
 const glass=new T.MeshLambertMaterial({map:glassTexture()}),roofTower=mat('#a9aeab'),flint=mat('#8f8d82'),slate=mat('#5d6663'),stone=mat('#b8b09a');
 for(const l of SKYLINE){
  const ring=l.ring.slice(0,-1).map(toLocal) as Point[],shape=new T.Shape(ring.map(p=>new T.Vector2(p[0],p[1])));
  const group=new T.Group();group.userData={skyline:l.id,approximateHeights:true,heightSource:l.heightSource};
  const solid=(depth:number,top:T.Material,side:T.Material)=>{const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1});g.translate(0,0,BASE);return new T.Mesh(g,[top,side]);};
  const cx=ring.reduce((s,p)=>s+p[0],0)/ring.length,cy=ring.reduce((s,p)=>s+p[1],0)/ring.length;
  if(l.kind==='tower')tower(group,l,solid,[cx,cy],ring);else church(group,l,solid,ring);
  root.add(group);
 }
 return root;

 function tower(group:T.Group,l:SkylineLandmark,solid:(d:number,t:T.Material,s:T.Material)=>T.Mesh,[cx,cy]:Point,ring:Point[]){
  group.add(solid(l.height,roofTower,glass));
  const o=orientation(ring);
  // Plant room on the roof, aligned to the building, and for the Blade a slim mast.
  const w=(o.max-o.min)*.35,d=(o.hi-o.lo)*.35,box=new T.Mesh(new T.BoxGeometry(w,d,3.5),roofTower);
  box.rotation.z=Math.atan2(o.uy,o.ux);box.position.set(cx,cy,BASE+l.height+1.75);group.add(box);
  if(l.top&&l.top>l.height){const mast=new T.Mesh(new T.CylinderGeometry(.35,.7,l.top-l.height,6),mat('#c9ccc8'));mast.rotation.x=Math.PI/2;mast.position.set(cx,cy,BASE+l.height+(l.top-l.height)/2);group.add(mast);}
 }

 function church(group:T.Group,l:SkylineLandmark,solid:(d:number,t:T.Material,s:T.Material)=>T.Mesh,ring:Point[]){
  const o=orientation(ring),angle=Math.atan2(o.uy,o.ux),mid=(o.lo+o.hi)/2,width=o.hi-o.lo;
  const at=(along:number,across:number):Point=>[along*o.ux-across*o.uy,along*o.uy+across*o.ux];
  group.add(solid(l.height,slate,flint));
  // Ridge roof over the middle of the nave, kept inside the walls, from the east end to the tower.
  const tower=Math.min(7.5,width*.6),ridgeStart=o.min+1,ridgeEnd=o.max-tower-.5,half=width*.28,rise=Math.min(4,width*.16);
  const A=at(ridgeStart,mid-half),B=at(ridgeEnd,mid-half),C=at(ridgeEnd,mid+half),D=at(ridgeStart,mid+half),E=at(ridgeStart,mid),F=at(ridgeEnd,mid),z=BASE+l.height;
  const v=(p:Point,h=0)=>[p[0],p[1],z+h];
  const positions=[...v(A),...v(B),...v(F,rise),...v(A),...v(F,rise),...v(E,rise), ...v(E,rise),...v(F,rise),...v(C),...v(E,rise),...v(C),...v(D),
   ...v(A),...v(E,rise),...v(D),...v(B),...v(C),...v(F,rise)];
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
  group.add(new T.Mesh(geometry,new T.MeshLambertMaterial({color:'#4f5957',side:T.DoubleSide})));
  // West tower: a square block with a slab cap.
  const tc=at(o.max-tower/2-.2,mid),height=l.top??l.height+10;
  const block=new T.Mesh(new T.BoxGeometry(tower,tower,height),flint);block.rotation.z=angle;block.position.set(tc[0],tc[1],BASE+height/2);group.add(block);
  const cap=new T.Mesh(new T.BoxGeometry(tower+1,tower+1,.8),stone);cap.rotation.z=angle;cap.position.set(tc[0],tc[1],BASE+height+.4);group.add(cap);
 }
}
