import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {VectorTile} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';
import {distance} from '../shared/geo';
import type {LngLat} from '../shared/types';

/**
 * BODS timetables carry no route shapes, so some bus patterns end up as straight lines between stops.
 * This routes those long gaps along the OpenStreetMap roads already bundled in the zoom-15 map tiles.
 */
const DRIVABLE=new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','living_street','service','busway']);
// Prefer main roads and avoid cutting through car parks and estate service roads unless it saves a lot.
const PENALTY:Record<string,number>={service:1.6,living_street:1.2,residential:1.05};
const M_LNG=69400,M_LAT=111200,JOIN=1.5,BRIDGE=3,ATTACH=60;
export const LONG_GAP=120;

interface Edge{a:number;b:number;cost:number;length:number}
const metres=(p:LngLat)=>[p[0]*M_LNG,p[1]*M_LAT] as const;

export class RoadNetwork {
 private points:LngLat[]=[];
 private adjacency:{to:number;cost:number}[][]=[];
 private edges:Edge[]=[];
 private edgeGrid=new Map<string,number[]>();
 private nodeGrid=new Map<string,number[]>();
 private cell=(p:LngLat)=>`${Math.floor(p[0]*M_LNG/100)}:${Math.floor(p[1]*M_LAT/100)}`;

 static fromTiles(directory='public/data/tiles/15'):RoadNetwork|undefined{
  if(!existsSync(directory))return undefined;
  const network=new RoadNetwork(),lines:{line:LngLat[];factor:number}[]=[],z=Number(directory.split('/').at(-1));
  for(const x of readdirSync(directory))for(const file of readdirSync(`${directory}/${x}`)){
   const bytes=readFileSync(`${directory}/${x}/${file}`);if(!bytes.length)continue;
   const tile=new VectorTile(new PbfReader(bytes));
   for(const layer of Object.values(tile.layers))for(let i=0;i<layer.length;i++){
    const feature=layer.feature(i),highway=String(feature.properties.highway??'');
    if(feature.properties.kind!=='road'||!DRIVABLE.has(highway))continue;
    const geometry=feature.toGeoJSON(Number(x),Number(file.replace('.pbf','')),z).geometry as {type:string;coordinates:any};
    const parts:LngLat[][]=geometry.type==='LineString'?[geometry.coordinates]:geometry.type==='MultiLineString'?geometry.coordinates:[];
    for(const part of parts)lines.push({line:part.map((c:number[])=>[c[0],c[1]] as LngLat),factor:PENALTY[highway]??1});
   }
  }
  for(const {line,factor} of lines)network.addLine(line,factor);
  network.bridgeEndpoints(lines.map(l=>l.line));
  return network;
 }

 private node(p:LngLat){
  const key=this.cell(p),[mx,my]=metres(p);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
   const [cx,cy]=key.split(':').map(Number);
   for(const id of this.nodeGrid.get(`${cx+dx}:${cy+dy}`)??[]){const [qx,qy]=metres(this.points[id]);if(Math.hypot(qx-mx,qy-my)<=JOIN)return id;}
  }
  const id=this.points.length;this.points.push(p);this.adjacency.push([]);
  if(!this.nodeGrid.has(key))this.nodeGrid.set(key,[]);this.nodeGrid.get(key)!.push(id);return id;
 }
 private link(a:number,b:number,factor:number){
  if(a===b)return;
  const length=distance(this.points[a],this.points[b]),cost=length*factor,id=this.edges.length;
  this.edges.push({a,b,cost,length});this.adjacency[a].push({to:b,cost});this.adjacency[b].push({to:a,cost});
  const cells=new Set([this.cell(this.points[a]),this.cell(this.points[b]),this.cell([(this.points[a][0]+this.points[b][0])/2,(this.points[a][1]+this.points[b][1])/2])]);
  for(const c of cells){if(!this.edgeGrid.has(c))this.edgeGrid.set(c,[]);this.edgeGrid.get(c)!.push(id);}
 }
 private addLine(line:LngLat[],factor:number){let previous=-1;for(const p of line){const id=this.node(p);if(previous>=0)this.link(previous,id,factor);previous=id;}}

 // geojson-vt drops collinear vertices, so a side road often ends on a through road without a shared node.
 private bridgeEndpoints(lines:LngLat[][]){
  for(const line of lines){
   for(const end of [line[0],line.at(-1)!]){
    const id=this.node(end);
    for(const hit of this.nearEdges(end,BRIDGE)){
     const edge=this.edges[hit.edge];if(edge.a===id||edge.b===id)continue;
     if(!this.adjacency[id].some(n=>n.to===edge.a))this.link(id,edge.a,1);
     if(!this.adjacency[id].some(n=>n.to===edge.b))this.link(id,edge.b,1);
    }
   }
  }
 }
 private nearEdges(p:LngLat,radius:number){
  const [cx,cy]=this.cell(p).split(':').map(Number),seen=new Set<number>(),out:{edge:number;distance:number;point:LngLat}[]=[];
  const reach=Math.ceil(radius/100);
  for(let dx=-reach;dx<=reach;dx++)for(let dy=-reach;dy<=reach;dy++)for(const id of this.edgeGrid.get(`${cx+dx}:${cy+dy}`)??[]){
   if(seen.has(id))continue;seen.add(id);
   const e=this.edges[id],[ax,ay]=metres(this.points[e.a]),[bx,by]=metres(this.points[e.b]),[px,py]=metres(p),vx=bx-ax,vy=by-ay,len2=vx*vx+vy*vy;
   const t=len2?Math.max(0,Math.min(1,((px-ax)*vx+(py-ay)*vy)/len2)):0,qx=ax+vx*t,qy=ay+vy*t,d=Math.hypot(px-qx,py-qy);
   if(d<=radius)out.push({edge:id,distance:d,point:[qx/M_LNG,qy/M_LAT]});
  }
  return out.sort((a,b)=>a.distance-b.distance);
 }

 /** Road geometry from a to b (excluding the endpoints), or undefined when no sensible road path exists. */
 route(from:LngLat,to:LngLat):LngLat[]|undefined{
  const straight=distance(from,to),limit=straight*2.5+150;
  const start=this.nearEdges(from,ATTACH)[0],end=this.nearEdges(to,ATTACH)[0];
  if(!start||!end)return undefined;
  const S=-1,T=-2,virtual=new Map<number,{to:number;cost:number}[]>([[S,[]],[T,[]]]),positions=new Map<number,LngLat>([[S,start.point],[T,end.point]]);
  const attach=(id:number,hit:typeof start)=>{const e=this.edges[hit.edge],factor=e.cost/(e.length||1);for(const n of [e.a,e.b]){const c=distance(hit.point,this.points[n])*factor;virtual.get(id)!.push({to:n,cost:c});(virtual.get(n) ?? virtual.set(n,[]).get(n)!).push({to:id,cost:c});}};
  attach(S,start);attach(T,end);
  if(start.edge===end.edge)virtual.get(S)!.push({to:T,cost:distance(start.point,end.point)});
  const point=(n:number)=>positions.get(n)??this.points[n];
  const best=new Map<number,number>([[S,0]]),from_=new Map<number,number>(),heap:[number,number][]=[[distance(start.point,to),S]];
  const push=(item:[number,number])=>{heap.push(item);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}};
  const pop=()=>{const top=heap[0],last=heap.pop()!;if(heap.length){heap[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top;};
  const done=new Set<number>();
  while(heap.length){
   const [,node]=pop();if(done.has(node))continue;done.add(node);
   if(node===T)break;
   const g=best.get(node)!;
   for(const n of [...(node>=0?this.adjacency[node]:[]),...(virtual.get(node)??[])]){
    const cost=g+n.cost;if(cost>limit||cost>=(best.get(n.to)??Infinity))continue;
    best.set(n.to,cost);from_.set(n.to,node);push([cost+distance(point(n.to),to),n.to]);
   }
  }
  if(!best.has(T))return undefined;
  const path:LngLat[]=[];for(let n:number|undefined=T;n!==undefined;n=from_.get(n))path.push(point(n));
  return path.reverse();
 }
}

/** Replace every gap longer than LONG_GAP metres with a road route where one exists. */
export function snapLine(network:RoadNetwork,line:LngLat[]){
 const out:LngLat[]=[line[0]];let snapped=0,left=0;
 for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i];
  if(distance(a,b)>LONG_GAP){const via=network.route(a,b);if(via){out.push(...via);snapped++;}else left++;}
  out.push(b);
 }
 return {line:out,snapped,left};
}
