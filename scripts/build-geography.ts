import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
import type {Feature,FeatureCollection,Polygon,MultiPolygon,LineString,Point} from 'geojson';
import {BOUNDS,LANDMARKS} from '../shared/config';
import {boundsOf,distance,inBounds,intersects} from '../shared/geo';
import type {Building,LngLat,GeographyManifest,StaticFeatures} from '../shared/types';
import {speedLimit as limitOf,surveyedLimit} from '../shared/speed-limits';
import {replacementLandmark,STATION_PLATFORMS,type LandmarkComponent} from '../shared/landmark-components';
const input:FeatureCollection=JSON.parse(await readFile('raw/geography.geojson','utf8'));
const source=JSON.parse(await readFile('raw/osm-source.json','utf8'));
const dest=process.env.GEOGRAPHY_OUTPUT??'raw/staging';await mkdir(dest,{recursive:true});
await rm(`${dest}/chunks`,{recursive:true,force:true});await mkdir(`${dest}/chunks`);
const chunks=new Map<string,Building[]>(), map:Feature[]=[], rails:Feature[]=[];
const components:LandmarkComponent[]=[];
for(const f of input.features){const p=f.properties??{},id=String(p.osm_id),landmark=replacementLandmark(id)??(STATION_PLATFORMS.includes(id)||id==='way/215630983'?'station':undefined);if(!landmark)continue;
 const g=f.geometry,polys=g.type==='MultiPolygon'?g.coordinates:g.type==='Polygon'?[g.coordinates]:id==='way/215630983'&&g.type==='LineString'?[[g.coordinates]]:[];
 const kind=id==='way/215630983'?'concourse':p.railway==='platform'?'platform':p.building==='roof'?'canopy':'building';
 const base=kind==='concourse'?8:kind==='canopy'?5:0;
 const height=kind==='platform'?.65:kind==='canopy'?.65:kind==='concourse'?4:landmark==='station'?7:id==='area/96032345'?21:id==='area/68649176'?18:id==='area/95856048'?16:10;
 for(const rings of polys)components.push({id,landmark,label:p.name??(kind==='platform'?`Platform ${p.ref}`:kind),rings:rings as LngLat[][],base,height,kind,tags:p as Record<string,string>});
}
await writeFile(`${dest}/landmark-components.json`,JSON.stringify({sourceUrl:source.url,snapshot:source.timestamp||source.retrievedAt,detail:'Georeferenced OSM footprints. Heights, roof profiles, glazing and materials are approximate.',components}));
const features:StaticFeatures={places:LANDMARKS.map(l=>({id:l.id,name:l.name,position:l.position,kind:l.kind})),signs:[],cameras:[]};
const counters:Record<string,number>={buildings:0,measuredHeights:0,estimatedHeights:0,roads:0,railways:0,signs:0,cameras:0};
const seenPlace=new Set(features.places.map(p=>p.name.toLowerCase())),badgeCells=new Set<string>();
const measured=(value:unknown)=>{const s=String(value??'');const n=parseFloat(s);return Number.isFinite(n)&&n>0?(s.includes('ft')?n*0.3048:n):0;};
for(const f of input.features){const p=f.properties??{},g=f.geometry,id=String(p.osm_id);if(!g)continue;
 if(p.building&&(g.type==='Polygon'||g.type==='MultiPolygon')){
  const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  for(let n=0;n<polys.length;n++){const rings=polys[n] as LngLat[][];if(!rings[0]||rings[0].length<4)continue;const box=boundsOf(rings[0]);if(!intersects(box,BOUNDS))continue;const center:LngLat=[(box[0]+box[2])/2,(box[1]+box[3])/2];
   const h=measured(p.height),levels=measured(p['building:levels']);const hash=[...id].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,0);const kind=String(p.building);const fallback=/apartments|commercial|office|retail/.test(kind)?13:/industrial|warehouse/.test(kind)?9:7;
   // Only replace a positively identified named footprint; proximity alone is insufficient.
   const named=LANDMARKS.find(l=>l.id===replacementLandmark(id)||l.footprintIds.includes(id));
   const b:Building={id:`${id}/${n}`,rings,height:Math.min(150,Math.max(2,h||levels*3||fallback)),heightSource:h?'measured':levels?'levels':'estimated',minHeight:Math.min(100,measured(p.min_height)),kind,name:p.name,roof:p['roof:shape']||(/house|residential|terrace|detached|^yes$/.test(kind)&&(!h||h<16)&&(!levels||levels<=3)?'gabled':'flat'),colour:hash%8,landmark:named?.id};
   if(kind==='roof'){b.minHeight=measured(p.min_height)||5;b.height=Math.max(b.minHeight+.5,h||b.minHeight+.65);b.roof='flat';}
   const key=`${Math.floor((center[0]-BOUNDS[0])/0.005)}_${Math.floor((center[1]-BOUNDS[1])/0.003)}`;if(!chunks.has(key))chunks.set(key,[]);chunks.get(key)!.push(b);counters.buildings++;counters[b.heightSource==='measured'?'measuredHeights':'estimatedHeights']++;
   map.push({type:'Feature',geometry:{type:'Polygon',coordinates:rings},properties:{...p,kind:'building',height:b.height,minHeight:b.minHeight,colour:b.colour,id:b.id,landmark:b.landmark??''}});
  }continue;
 }
 if(g.type==='Point'){
  const pos=g.coordinates as LngLat;if(!inBounds(pos))continue;
  if(p.name&&(p.place||p.railway==='station')&&!seenPlace.has(String(p.name).toLowerCase())){features.places.push({id,name:p.name,position:pos,kind:p.railway==='station'?'Station':p.place});seenPlace.add(String(p.name).toLowerCase());}
  const limit=surveyedLimit(p);
  if(limit&&(p.traffic_sign||p.highway==='traffic_sign'))features.signs.push({id,position:pos,limit,placement:'surveyed',source:'OpenStreetMap',sourceUrl:`https://www.openstreetmap.org/${id}`,observedAt:source.timestamp||source.retrievedAt,bearing:Number(p.direction)||undefined});
  if(p.highway==='speed_camera'||p.enforcement==='traffic_signals')features.cameras.push({id,position:pos,kind:p.enforcement==='traffic_signals'?'red-light':'speed',source:'OpenStreetMap',sourceUrl:`https://www.openstreetmap.org/${id}`,observedAt:source.timestamp||source.retrievedAt});
  continue;
 }
 let kind='';if(p.highway){kind='road';counters.roads++;const limit=limitOf(String(p['maxspeed:type']??''))??limitOf(String(p.maxspeed??''));if(limit&&g.type==='LineString'){const coords=g.coordinates as LngLat[],pos=coords[Math.floor(coords.length/2)],cell=`${Math.floor(pos[0]*250)}:${Math.floor(pos[1]*400)}:${limit}`;if(inBounds(pos)&&!badgeCells.has(cell)){badgeCells.add(cell);features.signs.push({id,position:pos,limit,placement:'road-limit',road:p.name,source:'OpenStreetMap road maxspeed',sourceUrl:`https://www.openstreetmap.org/${id}`,observedAt:source.timestamp||source.retrievedAt});}}}
 else if(p.railway&&g.type==='LineString'){kind='rail';counters.railways++;if(p.railway==='rail')rails.push(f);}
 else if(p.waterway||p.natural==='water')kind='water';else if(p.landuse||p.leisure||p.natural)kind='land';
 if(kind)map.push({type:'Feature',geometry:g,properties:{...p,kind}});
}
const manifest:GeographyManifest={version:'reading-v1',bounds:BOUNDS,generatedAt:new Date().toISOString(),sourceTimestamp:source.timestamp||source.retrievedAt,sourceUrl:source.url,attribution:'© OpenStreetMap contributors · ODbL 1.0',tiles:'/data/tiles/{z}/{x}/{y}.pbf',chunks:[],stats:counters};
for(const[id,buildings]of chunks){const bounds=boundsOf(buildings.flatMap(b=>b.rings[0]));await writeFile(`${dest}/chunks/${id}.json`,JSON.stringify(buildings));manifest.chunks.push({id,bounds,url:`/data/chunks/${id}.json`,count:buildings.length});}
counters.signs=features.signs.length;counters.cameras=features.cameras.length;
const index=geojsonvt({type:'FeatureCollection',features:map},{maxZoom:15,indexMaxZoom:12,indexMaxPoints:20000,tolerance:3,extent:4096,buffer:64});
const tileX=(lon:number,z:number)=>Math.floor((lon+180)/360*2**z),tileY=(lat:number,z:number)=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z);
let tileCount=0;
for(let z=10;z<=15;z++)for(let x=tileX(BOUNDS[0],z);x<=tileX(BOUNDS[2],z);x++){await mkdir(`${dest}/tiles/${z}/${x}`,{recursive:true});for(let y=tileY(BOUNDS[3],z);y<=tileY(BOUNDS[1],z);y++){const tile=index.getTile(z,x,y);await writeFile(`${dest}/tiles/${z}/${x}/${y}.pbf`,tile?vtpbf.fromGeojsonVt({reading:tile} as any):new Uint8Array());tileCount++;}}
counters.tiles=tileCount;
await writeFile(`${dest}/manifest.json`,JSON.stringify(manifest));await writeFile(`${dest}/features.json`,JSON.stringify(features));await writeFile(`${dest}/railways.json`,JSON.stringify({type:'FeatureCollection',features:rails}));
console.log(JSON.stringify(counters,null,2));
