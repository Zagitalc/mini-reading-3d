import type{StyleSpecification,LayerSpecification}from'maplibre-gl';import{BOUNDS}from'../../shared/config';
export function mapStyle():StyleSpecification{
 const source={source:'reading','source-layer':'reading'};const filter=(kind:string)=>['==',['get','kind'],kind]as any;
 const roadWidth:any=['interpolate',['linear'],['zoom'],10,.5,14,['match',['get','highway'],['motorway','trunk'],5,['primary','secondary'],3,1.5],18,['match',['get','highway'],['motorway','trunk'],28,['primary','secondary'],20,['tertiary','residential'],12,5]];
 const layers:LayerSpecification[]=[
 {id:'ground',type:'background',paint:{'background-color':'#e8e7e1'}},
 {id:'land',type:'fill',...source,filter:['all',filter('land'),['==',['geometry-type'],'Polygon']],paint:{'fill-color':['match',['get','landuse'],['residential','commercial','retail','industrial'],'#e4e1d9',['farmland','farmyard'],'#d8dccc','#ced7c8'],'fill-opacity':.72}},
 {id:'water-fill',type:'fill',...source,filter:['all',filter('water'),['==',['geometry-type'],'Polygon']],paint:{'fill-color':'#a9c2c4'}},
 {id:'water-line',type:'line',...source,filter:['all',filter('water'),['==',['geometry-type'],'LineString']],paint:{'line-color':'#a9c2c4','line-width':['interpolate',['linear'],['zoom'],11,1,16,['match',['get','waterway'],'river',22,'canal',8,2]]}},
 {id:'road-casing',type:'line',...source,filter:filter('road'),layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#c7c5bd','line-width':roadWidth.map((v:any,i:number)=>[4,6,8].includes(i)?['+',v,1.5]:v)}},
 {id:'roads',type:'line',...source,filter:filter('road'),layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['match',['get','highway'],['footway','path','cycleway'],'#e4dfd2','#f7f5ef'],'line-width':roadWidth}},
 {id:'rail-bed',type:'line',...source,filter:filter('rail'),paint:{'line-color':'#c8c5bb','line-width':['interpolate',['linear'],['zoom'],11,1,16,5]}},
 {id:'rail-lines',type:'line',...source,filter:filter('rail'),paint:{'line-color':'#858c89','line-width':1,'line-dasharray':[3,2]}},
 {id:'building-footprints',type:'fill',...source,filter:filter('building'),paint:{'fill-color':'#bdb8ad','fill-opacity':.65}},
 {id:'building-overview',type:'fill-extrusion',...source,maxzoom:14,filter:['all',filter('building'),['==',['get','landmark'],'']],paint:{'fill-extrusion-color':['match',['get','colour'],0,'#b6866d',1,'#b89d86',2,'#c8bfaa',3,'#8da5a5',4,'#b98b7a',5,'#c5b394',6,'#99aa9d','#c1a18e'],'fill-extrusion-height':['get','height'],'fill-extrusion-base':['coalesce',['get','minHeight'],0],'fill-extrusion-opacity':1}},
 {id:'road-labels',type:'symbol',...source,minzoom:15,filter:['all',filter('road'),['has','name']],layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':12,'text-max-angle':30,'symbol-spacing':350},paint:{'text-color':'#6f7772','text-halo-color':'#f4f2eb','text-halo-width':1.5}}
 ];
 return{version:8,glyphs:'/fonts/{fontstack}/{range}.pbf',sources:{reading:{type:'vector',tiles:[`${location.origin}/data/tiles/{z}/{x}/{y}.pbf`],bounds:BOUNDS,minzoom:10,maxzoom:15,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}},layers};
}
