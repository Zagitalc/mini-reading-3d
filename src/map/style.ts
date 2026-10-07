import type{Map,StyleSpecification,LayerSpecification}from'maplibre-gl';import{BOUNDS}from'../../shared/config';import{isDark,onThemeChange}from'../ui/theme';import{currentMode}from'../ui/modes';import{EMPHASIS,mixHex,resolveTarget}from'../../shared/basemap-emphasis';import type{ModeId}from'../../shared/modes';
/** Base map colours for light and dark mode; overlays keep their own colours. */
const PALETTE={
 light:{ground:'#e8e7e1',urban:'#e4e1d9',farm:'#d8dccc',green:'#ced7c8',water:'#a9c2c4',casing:'#c7c5bd',path:'#e4dfd2',road:'#f7f5ef',railBed:'#c8c5bb',rail:'#858c89',footprint:'#bdb8ad',blocks:['#b6866d','#b89d86','#c8bfaa','#8da5a5','#b98b7a','#c5b394','#99aa9d','#c1a18e'],label:'#6f7772',halo:'#f4f2eb'},
 dark:{ground:'#1b2220',urban:'#232b28',farm:'#233029',green:'#1f2d26',water:'#27414d',casing:'#101514',path:'#2c3531',road:'#3a4541',railBed:'#29302d',rail:'#76807b',footprint:'#3a423e',blocks:['#6e5446','#6f6356','#78705f','#4f6262','#6d5550','#766a55','#56645b','#72614f'],label:'#a9b4ae',halo:'#141a18'},
};
type Palette=typeof PALETTE.light;
/** The palette for a mode: the theme's colours with the mode's emphasis mixed in. */
const tuned=(dark:boolean,mode:ModeId):Palette&{railWidth:number}=>{
 const base=dark?PALETTE.dark:PALETTE.light,{mix,rail}=EMPHASIS[mode],out:Palette={...base,blocks:[...base.blocks]};
 const move=(colour:string,key:keyof typeof mix)=>{const m=mix[key];return m?mixHex(colour,resolveTarget(m.to,base.ground,dark),m.t):colour;};
 for(const key of Object.keys(mix) as (keyof typeof mix)[]){
  if(key==='blocks')out.blocks=base.blocks.map(b=>move(b,'blocks'));
  else (out as Record<string,unknown>)[key]=move((base as unknown as Record<string,string>)[key],key);
 }
 return {...out,railWidth:rail};
};
const paints=(c:Palette&{railWidth?:number}):[string,any,any][]=>[
 ['ground','background-color',c.ground],
 ['land','fill-color',['match',['get','landuse'],['residential','commercial','retail','industrial'],c.urban,['farmland','farmyard'],c.farm,c.green]],
 ['water-fill','fill-color',c.water],['water-line','line-color',c.water],['road-casing','line-color',c.casing],
 ['roads','line-color',['match',['get','highway'],['footway','path','cycleway'],c.path,c.road]],
 ['rail-bed','line-color',c.railBed],['rail-lines','line-color',c.rail],
 ['rail-bed','line-width',['interpolate',['linear'],['zoom'],11,1*(c.railWidth??1),16,5*(c.railWidth??1)]],['rail-lines','line-width',1*(c.railWidth??1)],['building-footprints','fill-color',c.footprint],
 ['building-overview','fill-extrusion-color',['match',['get','colour'],...c.blocks.slice(0,7).flatMap((colour,i)=>[i,colour]),c.blocks[7]]],
 ['road-labels','text-color',c.label],['road-labels','text-halo-color',c.halo],
];
/** Keeps the base map in step with the light or dark colours. */
export function followColourScheme(map:Map){
 const apply=()=>{for(const [layer,property,value] of paints(tuned(isDark(),currentMode())))map.setPaintProperty(layer,property,value);};
 onThemeChange(apply);
 // A new mode re-tunes the base map in place.
 document.addEventListener('reading-mode',apply);map.on('remove',()=>document.removeEventListener('reading-mode',apply));
}
/** The style for a mode (Explore, which leaves the palette alone, when none is given). */
export function mapStyle(dark=isDark(),mode:ModeId='explore'):StyleSpecification{
 const source={source:'reading','source-layer':'reading'};const filter=(kind:string)=>['==',['get','kind'],kind]as any;
 const roadWidth:any=['interpolate',['linear'],['zoom'],10,.5,14,['match',['get','highway'],['motorway','trunk'],5,['primary','secondary'],3,1.5],18,['match',['get','highway'],['motorway','trunk'],28,['primary','secondary'],20,['tertiary','residential'],12,5]];
 const layers:LayerSpecification[]=[
 {id:'ground',type:'background',paint:{}},
 {id:'land',type:'fill',...source,filter:['all',filter('land'),['==',['geometry-type'],'Polygon']],paint:{'fill-opacity':.72}},
 {id:'water-fill',type:'fill',...source,filter:['all',filter('water'),['==',['geometry-type'],'Polygon']],paint:{}},
 {id:'water-line',type:'line',...source,filter:['all',filter('water'),['==',['geometry-type'],'LineString']],paint:{'line-width':['interpolate',['linear'],['zoom'],11,1,16,['match',['get','waterway'],'river',22,'canal',8,2]]}},
 {id:'road-casing',type:'line',...source,filter:filter('road'),layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':roadWidth.map((v:any,i:number)=>[4,6,8].includes(i)?['+',v,1.5]:v)}},
 {id:'roads',type:'line',...source,filter:filter('road'),layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':roadWidth}},
 {id:'rail-bed',type:'line',...source,filter:filter('rail'),paint:{'line-width':['interpolate',['linear'],['zoom'],11,1,16,5]}},
 {id:'rail-lines',type:'line',...source,filter:filter('rail'),paint:{'line-width':1,'line-dasharray':[3,2]}},
 {id:'building-footprints',type:'fill',...source,filter:filter('building'),paint:{'fill-opacity':.65}},
 {id:'building-overview',type:'fill-extrusion',...source,maxzoom:14,filter:['all',filter('building'),['==',['get','landmark'],'']],paint:{'fill-extrusion-height':['get','height'],'fill-extrusion-base':['coalesce',['get','minHeight'],0],'fill-extrusion-opacity':1}},
 {id:'road-labels',type:'symbol',...source,minzoom:15,filter:['all',filter('road'),['has','name']],layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':12,'text-max-angle':30,'symbol-spacing':350},paint:{'text-halo-width':1.5}}
 ];
 for(const [id,property,value] of paints(tuned(dark,mode)))(layers.find(l=>l.id===id)!.paint as Record<string,unknown>)[property]=value;
 return{version:8,glyphs:'/fonts/{fontstack}/{range}.pbf',sources:{reading:{type:'vector',tiles:[`${location.origin}/data/tiles/{z}/{x}/{y}.pbf`],bounds:BOUNDS,minzoom:10,maxzoom:15,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}},layers};
}
