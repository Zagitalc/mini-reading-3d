import {createHash} from 'node:crypto';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {RoadNetwork,snapLine} from './road-snap';
import {stopDistances,type RouteJourneys} from '../shared/live-departures';
import type {LngLat} from '../shared/types';
// One-off repair of the bundled data: routes long stop-to-stop gaps in the published bus shapes along roads,
// recomputes stop distances and renames the journey files. The nightly build (build-gtfs.ts) does the same on each refresh.
const data='public/data',roads=RoadNetwork.fromTiles();if(!roads)throw Error('public/data/tiles/15 is missing');
const network=JSON.parse(await readFile(`${data}/bus-network.json`,'utf8')),index=JSON.parse(await readFile(`${data}/bus-stops.json`,'utf8'));
const position=new Map<string,LngLat>(index.stops.map((s:{id:string;position:LngLat})=>[s.id,s.position]));
let snapped=0,left=0;
for(const id of Object.keys(network.shapes)){const r=snapLine(roads,network.shapes[id]);network.shapes[id]=r.line;snapped+=r.snapped;left+=r.left;}
console.log(`network: ${snapped} gaps routed, ${left} left straight`);
await writeFile(`${data}/bus-network.json`,JSON.stringify(network));
for(const route of Object.values<{journeysUrl?:string}>(index.routes)){
 if(!route.journeysUrl)continue;
 const file=`public${route.journeysUrl}`,journeys:RouteJourneys=JSON.parse(await readFile(file,'utf8'));
 journeys.shapes=journeys.shapes.map(shape=>snapLine(roads,shape).line.map(([x,y])=>[+x.toFixed(5),+y.toFixed(5)] as LngLat));
 for(const p of journeys.patterns)p.along=stopDistances(p.stops.map(s=>position.get(s)!),journeys.shapes[p.shape]);
 const name=`journeys-${createHash('sha256').update(JSON.stringify(journeys)).digest('hex').slice(0,20)}.json`,url=route.journeysUrl.replace(/journeys-[0-9a-f]+\.json$/,name);
 await writeFile(`public${url}`,JSON.stringify(journeys));if(url!==route.journeysUrl)await rm(file);route.journeysUrl=url;
}
await writeFile(`${data}/bus-stops.json`,JSON.stringify(index));
