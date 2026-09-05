import {ShapeUtils,Vector2}from'three';import{toLocal}from'../../shared/geo';import type{Building}from'../../shared/types';
const palette=[[.68,.39,.27],[.73,.54,.40],[.84,.77,.63],[.50,.60,.61],[.66,.43,.36],[.77,.66,.49],[.48,.54,.49],[.80,.61,.50]];
export type MeshData={position:Float32Array;uv:Float32Array;color:Float32Array};
function build(buildings:Building[]){const pos:number[]=[],uv:number[]=[],colors:number[]=[],roof:number[]=[],roofColors:number[]=[];
 for(const b of buildings){if(b.landmark)continue;const rings=b.rings.map(r=>r.slice(0,-1).map(toLocal));const outer=rings[0];if(outer.length<3)continue;const col=palette[b.colour],top=Math.max(b.height,b.minHeight+(b.kind==='roof'?.1:2)),bottom=b.minHeight;
  const triangle=(a:number[],bb:number[],c:number[],dest=pos,cs=colors,color=col)=>{dest.push(...a,...bb,...c);cs.push(...color,...color,...color);};
  for(const ring of rings){for(let i=0;i<ring.length;i++){const a=ring[i],c=ring[(i+1)%ring.length],w=Math.hypot(a[0]-c[0],a[1]-c[1])/8,h=(top-bottom)/8;triangle([a[0],a[1],bottom],[c[0],c[1],bottom],[c[0],c[1],top]);triangle([a[0],a[1],bottom],[c[0],c[1],top],[a[0],a[1],top]);uv.push(0,0,w,0,w,h,0,0,w,h,0,h);}}
  const holes=rings.slice(1).map(r=>r.map(p=>new Vector2(...p))),contour=outer.map(p=>new Vector2(...p)),all=rings.flat();const faces=ShapeUtils.triangulateShape(contour,holes);
  for(const face of faces){triangle(...face.map(i=>[...all[i],top]) as [number[],number[],number[]],roof,roofColors,[.34,.36,.35]);}
  if(b.roof!=='flat'&&rings.length===1&&top<18){
   let edge=0,longest=0;for(let i=0;i<outer.length;i++){const n=outer[(i+1)%outer.length],d=Math.hypot(n[0]-outer[i][0],n[1]-outer[i][1]);if(d>longest){longest=d;edge=i;}}
   const first=outer[edge],next=outer[(edge+1)%outer.length],dx=(next[0]-first[0])/longest,dy=(next[1]-first[1])/longest;
   const v=(p:number[])=>-p[0]*dy+p[1]*dx,values=outer.map(v),lo=Math.min(...values),hi=Math.max(...values),mid=(lo+hi)/2,half=(hi-lo)/2,pitch=Math.min(3.5,half*.5);
   if(half>1&&half<22){for(const side of [-1,1]){const poly:number[][]=[];for(let i=0;i<outer.length;i++){const a=outer[i],b=outer[(i+1)%outer.length],av=(v(a)-mid)*side,bv=(v(b)-mid)*side;if(av>=0)poly.push(a);if((av<0&&bv>0)||(av>0&&bv<0)){const t=av/(av-bv);poly.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}if(poly.length<3)continue;const faces=ShapeUtils.triangulateShape(poly.map(p=>new Vector2(p[0],p[1])),[]);for(const f of faces)triangle(...f.map(i=>[poly[i][0],poly[i][1],top+pitch*(1-Math.abs(v(poly[i])-mid)/half)])as[number[],number[],number[]],roof,roofColors,[.31,.27,.24]);}}
  }
 }
 return{walls:{position:new Float32Array(pos),uv:new Float32Array(uv),color:new Float32Array(colors)},roofs:{position:new Float32Array(roof),uv:new Float32Array(roof.length/3*2),color:new Float32Array(roofColors)}};
}
self.onmessage=async(e:MessageEvent<{id:string;url:string}>)=>{try{const r=await fetch(e.data.url);if(!r.ok)throw Error('Building chunk unavailable');const buildings:Building[]=await r.json(),meshes=build(buildings);self.postMessage({id:e.data.id,...meshes},[meshes.walls.position.buffer,meshes.walls.uv.buffer,meshes.walls.color.buffer,meshes.roofs.position.buffer,meshes.roofs.uv.buffer,meshes.roofs.color.buffer]);}catch{self.postMessage({id:e.data.id,error:true});}};
