import{mkdir,writeFile,rm}from'node:fs/promises';
import{createWriteStream}from'node:fs';
import{Readable}from'node:stream';
import{pipeline}from'node:stream/promises';
import{subsetGtfs,zipCsvReader,zipGtfs}from'./gtfs-subset.mjs';
await mkdir('raw',{recursive:true});
const headers={'User-Agent':'MiniReading3D/0.1 (+https://github.com/Zagitalc/mini-reading-3d)','Accept':'application/zip, application/octet-stream, */*'};
const get=(url,timeout=180000)=>fetch(url,{headers,signal:AbortSignal.timeout(timeout)});
const current='https://www.reading-buses.co.uk/open-data/network/current?format=gtfs';
// BODS regional GTFS is converted from the TransXChange Reading Buses publishes to DfT. It is the
// fallback because reading-buses.co.uk answers HTTP 403 to cloud runners such as GitHub Actions.
const bods=process.env.BODS_GTFS_URL??'https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/south_east/';
const saveGtfs=(bytes,source)=>Promise.all([writeFile('raw/reading-gtfs.zip',bytes),writeFile('raw/gtfs-source.json',JSON.stringify({...source,retrievedAt:new Date().toISOString()}))]);

async function publisherGtfs(){
 let r=await get(current);
 if(r.ok)return {bytes:new Uint8Array(await r.arrayBuffer()),url:current};
 console.warn(`Current GTFS download returned HTTP ${r.status} from ${new URL(r.url).hostname}; checking the publisher's listed download.`);
 const index=await get('https://www.reading-buses.co.uk/open-data');
 if(!index.ok)throw Error(`Publisher download index: HTTP ${index.status}`);
 const html=await index.text();
 // Only accept an explicit GTFS download from the publisher's own public S3 directory.
 const links=[...html.matchAll(/href="(https:\/\/s3-eu-west-1\.amazonaws\.com\/passenger-sources\/readingbuses\/gtfs\/readingbuses_\d+\.zip)"[^>]*>\s*Download GTFS/g)].map(m=>m[1]);
 const latest=links.sort((a,b)=>Number(b.match(/_(\d+)\.zip$/)[1])-Number(a.match(/_(\d+)\.zip$/)[1]))[0];
 if(!latest)throw Error('Publisher did not list a GTFS archive');
 r=await get(latest);
 if(!r.ok)throw Error(`Publisher archive: HTTP ${r.status}`);
 return {bytes:new Uint8Array(await r.arrayBuffer()),url:latest};
}

async function bodsGtfs(){
 const regional='raw/bods-region-gtfs.zip';
 const r=await get(bods,600000);
 if(!r.ok||!r.body)throw Error(`BODS GTFS: HTTP ${r.status} from ${new URL(r.url).hostname}`);
 // Stream to disk: the regional archive is too large to buffer comfortably.
 await pipeline(Readable.fromWeb(r.body),createWriteStream(regional));
 try{return zipGtfs(await subsetGtfs(zipCsvReader(regional),{noc:'RBUS',name:/^Reading (Buses|Transport)\b/i}));}
 finally{await rm(regional,{force:true});}
}

async function downloadGtfs(){
 if(process.env.GTFS_SOURCE!=='bods'){
  try{const {bytes,url}=await publisherGtfs();await saveGtfs(bytes,{provider:'publisher',url});return;}
  catch(e){console.warn(`${e.message}; falling back to the Bus Open Data Service.`);}
 }
 await saveGtfs(await bodsGtfs(),{provider:'bods',url:bods});
}

if(!process.argv.includes('--gtfs-only')){
 const r=await get('https://download.geofabrik.de/europe/united-kingdom/england/berkshire-latest.osm.pbf');
 if(!r.ok)throw Error(`raw/berkshire.osm.pbf: HTTP ${r.status} from ${new URL(r.url).hostname}`);
 await writeFile('raw/berkshire.osm.pbf',new Uint8Array(await r.arrayBuffer()));
 console.log('Downloaded raw/berkshire.osm.pbf');
}
await downloadGtfs();
console.log('Downloaded raw/reading-gtfs.zip');
