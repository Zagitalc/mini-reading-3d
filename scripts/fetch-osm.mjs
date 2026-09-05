import {mkdir,writeFile} from 'node:fs/promises';
const bbox='51.39,-1.08,51.50,-0.84';
const query=`[out:json][timeout:180];(way[building](${bbox});relation[building](${bbox});way[highway](${bbox});way[railway](${bbox});way[waterway](${bbox});way[natural=water](${bbox});relation[natural=water](${bbox});way[landuse](${bbox});relation[landuse](${bbox});way[leisure](${bbox});node[place](${bbox});node[railway=station](${bbox});node[highway=speed_camera](${bbox});node[traffic_sign](${bbox});relation[enforcement](${bbox}););out body geom;`;
await mkdir('raw',{recursive:true});
let last;
for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){
 try{const r=await fetch(endpoint+'?'+new URLSearchParams({data:query}),{signal:AbortSignal.timeout(240000)});if(!r.ok)throw Error(`HTTP ${r.status}`);const data=await r.json();if(data.remark||!data.elements?.length)throw Error(data.remark||'Empty extract');await writeFile('raw/reading-osm.json',JSON.stringify(data));await writeFile('raw/osm-source.json',JSON.stringify({url:endpoint,query,retrievedAt:new Date().toISOString(),timestamp:data.osm3s?.timestamp_osm_base},null,2));console.log(`Saved ${data.elements.length} OSM elements`);process.exit(0);}catch(e){last=e;console.error(endpoint,e.message);}
}
throw last;
