import {createFootprintLandmarks} from './footprint-landmarks';
import * as T from'three';import{LANDMARKS}from'../../shared/config';import{toLocal}from'../../shared/geo';
export function createLandmarks(){const root=new T.Group();const mats=new Map<string,T.MeshLambertMaterial>();const mat=(c:string)=>{if(!mats.has(c))mats.set(c,new T.MeshLambertMaterial({color:c}));return mats.get(c)!;};
 root.add(createFootprintLandmarks());
 for(const l of LANDMARKS){if(l.id!=='abbey'&&l.id!=='stadium')continue;const g=new T.Group(),[x,y]=toLocal(l.position);g.position.set(x,y,.4);g.userData={landmark:l};
  const box=(x:number,y:number,z:number,w:number,d:number,h:number,c:string)=>{const m=new T.Mesh(new T.BoxGeometry(w,d,h),mat(c));m.position.set(x,y,z+h/2);g.add(m);return m;};
  if(l.id==='abbey'){for(const xx of [-22,22])box(xx,0,0,4,70,8,'#b5a38a');for(const yy of [-32,8,32])box(0,yy,0,46,3,7,'#b7aa93');for(let i=-2;i<=2;i++){box(i*9,-5,0,3,3,11,'#bba88b');box(i*9,26,0,3,3,9,'#bba88b');}}
  if(l.id==='stadium'){box(0,0,0,100,68,.2,'#6c8a61');for(const yy of [-49,49]){box(0,yy,0,140,25,20,'#b6b8ac');box(0,yy,20,148,30,3,'#bdc7c7');}for(const xx of [-66,66]){box(xx,0,0,22,78,20,'#b3b7ad');box(xx,0,20,27,82,3,'#c0c9c9');}for(const yy of [-34,34])box(0,yy,1,100,.5,.1,'#d5dbd0');box(0,0,1,.4,68,.1,'#d5dbd0');}
  root.add(g);
 }return root;}
