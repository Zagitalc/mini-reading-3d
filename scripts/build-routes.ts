import {busBrands} from '../shared/bus-style';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {clipLine,deduplicate,fallbackColour,type StaticRoute} from '../shared/static-routes';
import {RailNetwork,STATIONS} from '../server/rail-network';
import type {LngLat} from '../shared/types';
const dest=process.env.GEOGRAPHY_OUTPUT??'raw/staging';await mkdir(dest,{recursive:true});
const bus=JSON.parse(await readFile('public/data/bus-network.json','utf8'));
// Operator colour names verified against Reading Buses' current route pages/network map.
// Hex values are miniature-palette approximations, not official brand specifications.
const branded=busBrands;
const buses:StaticRoute[]=bus.routes.map((r:Record<string,string>)=>{
 const trips=bus.trips.filter((t:Record<string,string>)=>t.route_id===r.route_id),brand=branded[r.route_short_name];
 return {id:r.route_id,label:r.route_short_name,operator:bus.source,destinations:[...new Set(trips.map((t:Record<string,string>)=>t.trip_headsign).filter(Boolean))].sort(),
  kind:'bus',colour:brand?.[0]??fallbackColour(r.route_id),colourSource:brand?`Operator ${brand[1]} branding; display shade approximate. https://www.reading-buses.co.uk/maps/15 (checked 2026-09-05)`:'Deterministic FNV-1a palette fallback; not an operator colour',
  source:bus.source+' GTFS shapes',sourceUrl:bus.sourceUrl,snapshot:bus.retrievedAt,
  coordinates:deduplicate([...new Set<string>(trips.map((t:Record<string,string>)=>t.shape_id))].sort().flatMap(id=>clipLine(bus.shapes[id]))) };
});
await writeFile(`${dest}/bus-routes.json`,JSON.stringify(buses));
const geo=JSON.parse(await readFile(`${dest}/railways.json`,'utf8')),manifest=JSON.parse(await readFile(`${dest}/manifest.json`,'utf8'));
const network=new RailNetwork(geo.features);
// These anchors select actual graph vertices, never add connecting straight lines.
const anchors:Record<string,LngLat>={...STATIONS,WEST:[-1.081,51.485],EAST:[-.83672,51.48402],SOUTH:[-1.01111,51.38952],SOUTHWEST:[-1.08055,51.43164],NORTH:[-.87734,51.50022],SOUTHEAST:[-.83985,51.40714],DOWNS:[-.83965,51.40498],CURVE_N:[-.9953327,51.4618066],CURVE_S:[-.9897475,51.4560104]};
Object.assign(STATIONS,anchors);
const specs=[['western','Great Western corridor','WEST','EAST','#476da5'],['kennet','Kennet corridor','RDG','SOUTHWEST','#b16e32'],['basingstoke','Green Park corridor','RDG','SOUTH','#8b5793'],['wokingham','Earley–Wokingham corridor','RDG','SOUTHEAST','#238b83'],['regatta','Twyford–Wargrave branch','TWY','NORTH','#a84e60'],['north-downs','Wokingham southern branch','WKM','DOWNS','#9c8052'],['west-curve','Reading West curve','CURVE_N','CURVE_S','#677b3b']];
const rail:StaticRoute[]=[];
for(const [id,label,a,b,colour] of specs){const path=network.route(a,b);if(!path)throw Error(`No connected railway path: ${label}`);const coordinates=clipLine(path);if(!coordinates.length)throw Error(`Empty corridor: ${label}`);
 const endpoints=[coordinates[0][0],coordinates.at(-1)!.at(-1)!].map(p=>`${p[1].toFixed(5)}° N, ${Math.abs(p[0]).toFixed(5)}° W`);
 rail.push({id,label,kind:'rail',colour,colourSource:'Fixed infrastructure palette; does not identify train operators',destinations:endpoints,source:'OpenStreetMap railway infrastructure',sourceUrl:manifest.sourceUrl,snapshot:manifest.sourceTimestamp,coordinates});
}
await writeFile(`${dest}/rail-corridors.json`,JSON.stringify(rail));console.log(`${buses.length} bus routes; ${rail.length} connected railway corridors`);
