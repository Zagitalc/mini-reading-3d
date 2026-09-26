import{mkdir,writeFile}from'node:fs/promises';
await mkdir('raw',{recursive:true});
const headers={'User-Agent':'MiniReading3D/0.1 (+https://github.com/Zagitalc/mini-reading-3d)','Accept':'application/zip, application/octet-stream, */*'};
const get=url=>fetch(url,{headers,signal:AbortSignal.timeout(180000)});
const current='https://www.reading-buses.co.uk/open-data/network/current?format=gtfs';
for(const [url,file]of [['https://download.geofabrik.de/europe/united-kingdom/england/berkshire-latest.osm.pbf','raw/berkshire.osm.pbf'],[current,'raw/reading-gtfs.zip']]){
 if(process.argv.includes('--gtfs-only')&&file!=='raw/reading-gtfs.zip')continue;
 let r=await get(url);
 if(!r.ok&&url===current){
  console.warn(`Current GTFS download returned HTTP ${r.status} from ${new URL(r.url).hostname}; checking the publisher's listed download.`);
  const index=await get('https://www.reading-buses.co.uk/open-data');
  if(!index.ok)throw Error(`Publisher download index: HTTP ${index.status}`);
  const html=await index.text();
  // Only accept an explicit GTFS download from the publisher's own public S3 directory.
  const links=[...html.matchAll(/href="(https:\/\/s3-eu-west-1\.amazonaws\.com\/passenger-sources\/readingbuses\/gtfs\/readingbuses_\d+\.zip)"[^>]*>\s*Download GTFS/g)].map(m=>m[1]);
  const latest=links.sort((a,b)=>Number(b.match(/_(\d+)\.zip$/)[1])-Number(a.match(/_(\d+)\.zip$/)[1]))[0];
  if(!latest)throw Error('Publisher did not list a GTFS archive');
  r=await get(latest);
 }
 if(!r.ok)throw Error(`${file}: HTTP ${r.status} from ${new URL(r.url).hostname}`);
 await writeFile(file,new Uint8Array(await r.arrayBuffer()));
 if(file==='raw/reading-gtfs.zip')await writeFile('raw/gtfs-source.json',JSON.stringify({url,retrievedAt:new Date().toISOString()}));
 console.log(`Downloaded ${file}`);
}
