import{mkdir,writeFile}from'node:fs/promises';
await mkdir('raw',{recursive:true});
for(const [url,file]of [['https://download.geofabrik.de/europe/united-kingdom/england/berkshire-latest.osm.pbf','raw/berkshire.osm.pbf'],['https://www.reading-buses.co.uk/open-data/network/current?format=gtfs','raw/reading-gtfs.zip']]){const r=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error(`${file}: HTTP ${r.status}`);await writeFile(file,new Uint8Array(await r.arrayBuffer()));console.log(`Downloaded ${file}`);}
