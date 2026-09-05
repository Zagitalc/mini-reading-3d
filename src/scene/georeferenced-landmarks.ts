import * as T from 'three';
import {toLocal} from '../../shared/geo';
import type {LandmarkComponent} from '../../shared/landmark-components';
// Pattern coordinates are in geographic east/north metres and clipped by each footprint.
function roofMaterial(oracle:boolean,angle:number){
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const c=canvas.getContext('2d')!;
 c.fillStyle=oracle?'#bec3c0':'#dedfd8';c.fillRect(0,0,128,128);
 c.fillStyle=oracle?'#77949c':'#bcc4c4';c.fillRect(0,48,128,oracle?24:8);
 c.strokeStyle='#edf0e9';c.lineWidth=2;for(let x=0;x<128;x+=16){c.beginPath();c.moveTo(x,0);c.lineTo(x,128);c.stroke();}
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(.025,.025);texture.rotation=angle;
 return new T.MeshLambertMaterial({map:texture,side:T.DoubleSide});
}
export function georeferencedLandmarks(components:LandmarkComponent[]){
 const axis=(id:string)=>{const r=components.find(c=>c.id===id)!.rings[0].map(toLocal);let angle=0,longest=0;for(let i=1;i<r.length;i++){const dx=r[i][0]-r[i-1][0],dy=r[i][1]-r[i-1][1],d=Math.hypot(dx,dy);if(d>longest){longest=d;angle=Math.atan2(dy,dx);}}return angle;};
 const root=new T.Group(),roof={oracle:roofMaterial(true,axis('area/68649176')),station:roofMaterial(false,axis('area/1318127040'))},stone=new T.MeshLambertMaterial({color:'#b9b8ad'}),glass=new T.MeshLambertMaterial({color:'#8aa5aa'}),walls=new T.MeshLambertMaterial({color:'#c3ae98'});
 const facade=document.createElement('canvas');facade.width=128;facade.height=64;const ctx=facade.getContext('2d')!;ctx.fillStyle='#c3b6a6';ctx.fillRect(0,0,128,64);ctx.fillStyle='#789296';ctx.fillRect(0,18,128,28);ctx.fillStyle='#d2d0c3';for(let x=0;x<128;x+=16)ctx.fillRect(x,0,2,64);
 const wallTexture=new T.CanvasTexture(facade);wallTexture.colorSpace=T.SRGBColorSpace;wallTexture.wrapS=wallTexture.wrapT=T.RepeatWrapping;wallTexture.repeat.set(.07,.25);walls.map=wallTexture;
 const plainRoof=new T.MeshLambertMaterial({color:'#afb4b1'});
 for(const c of components){
  const rings=c.rings.map(r=>r.map(p=>new T.Vector2(...toLocal(p))));
  const shape=new T.Shape(rings[0]);shape.holes=rings.slice(1).map(r=>new T.Path(r));
  const geometry=new T.ExtrudeGeometry(shape,{depth:c.height,bevelEnabled:false,steps:1});geometry.translate(0,0,c.base+.12);
  const top=c.kind==='platform'?stone:c.landmark==='oracle'&&c.id!=='area/68649176'?plainRoof:roof[c.landmark as 'oracle'|'station'];
  const side=c.kind==='platform'?stone:c.kind==='concourse'?glass:c.kind==='canopy'?roof.station:walls;
  const mesh=new T.Mesh(geometry,[top,side]);mesh.userData={component:c.id,approximateHeights:true};root.add(mesh);
  // Thin raised roof level follows the same irregular boundary, including inner holes.
  if(c.kind==='building'&&c.landmark==='oracle'){
   const cap=new T.Mesh(new T.ShapeGeometry(shape),top);cap.position.z=c.base+c.height+.16;root.add(cap);
  }
 }
 return root;
}
