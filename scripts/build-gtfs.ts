import {gtfsContentHash,validateGtfs} from './gtfs-validation';
import {compileTimetable,timetableVersion,TIMETABLE_COMPILER} from './compile-timetable';
import {deriveShapes} from './derive-shapes';
import {readFile,writeFile,mkdir,rm,stat}from'node:fs/promises';import{unzipSync,strFromU8}from'fflate';import{parse}from'csv-parse/sync';import{geometryIntersects,inBounds}from'../shared/geo';import type{LngLat}from'../shared/types';
const bytes=await readFile('raw/reading-gtfs.zip'),archive=unzipSync(new Uint8Array(bytes));
const contentHash=gtfsContentHash(archive),version=timetableVersion(contentHash);
const dest=process.env.GTFS_OUTPUT??'public/data';await mkdir(dest,{recursive:true});
const source=await readFile('raw/gtfs-source.json','utf8').then(JSON.parse).catch(async()=>({retrievedAt:(await stat('raw/reading-gtfs.zip')).mtime.toISOString()}));
const provenance=source.provider==='bods'?{source:'Reading Buses (via Bus Open Data Service)',sourceUrl:'https://www.bus-data.dft.gov.uk/',licence:'OGL 3.0',retrievedAt:source.retrievedAt}:{source:'Reading Buses',sourceUrl:'https://www.reading-buses.co.uk/open-data',licence:'OGL 3.0',retrievedAt:source.retrievedAt};
const parsed=new Map<string,Record<string,string>[]>();
const rows=(file:string):Record<string,string>[]=>{if(!parsed.has(file))parsed.set(file,archive[file]?parse(strFromU8(archive[file]),{columns:true,skip_empty_lines:true,bom:true}):[]);return parsed.get(file)!;};
const shapes:Record<string,LngLat[]>={};const grouped=new Map<string,Record<string,string>[]>();
for(const row of rows('shapes.txt')){if(!grouped.has(row.shape_id))grouped.set(row.shape_id,[]);grouped.get(row.shape_id)!.push(row);}
for(const[id,points]of grouped){const line=points.sort((a,b)=>+a.shape_pt_sequence-+b.shape_pt_sequence).map(p=>[+p.shape_pt_lon,+p.shape_pt_lat]as LngLat);if(geometryIntersects(line))shapes[id]=line;}
// BODS GTFS can arrive without shapes.txt; give those trips geometry from the previous bundle's shapes.
const unshaped=rows('trips.txt').filter(t=>!grouped.has(t.shape_id));let shapeSource:{reused:number;straight:number}|undefined;
if(unshaped.length){
 const previousNetwork=await readFile('public/data/bus-network.json','utf8').then(JSON.parse).catch(()=>undefined);
 const label=new Map<string,string>((previousNetwork?.routes??[]).map((r:Record<string,string>)=>[r.route_id,r.route_short_name]));
 const seen=new Set<string>(),reference=(previousNetwork?.trips??[]).flatMap((t:Record<string,string>)=>{if(seen.has(t.shape_id)||!previousNetwork.shapes[t.shape_id])return[];seen.add(t.shape_id);return[{routeLabel:label.get(t.route_id)??'',line:previousNetwork.shapes[t.shape_id]}];});
 const derived=deriveShapes(unshaped,rows('routes.txt'),rows('stop_times.txt'),rows('stops.txt'),reference);
 for(const t of unshaped){const id=derived.tripShapes.get(t.trip_id);if(id&&geometryIntersects(derived.shapes[id])){t.shape_id=id;shapes[id]=derived.shapes[id];}}
 shapeSource={reused:derived.reused,straight:derived.straight};
 console.log(`Derived shapes for ${unshaped.length} trips: ${derived.reused} patterns reuse earlier road geometry, ${derived.straight} use straight lines between stops`);
}
const trips=rows('trips.txt').filter(t=>shapes[t.shape_id]);const routeIds=new Set(trips.map(t=>t.route_id));const routes=rows('routes.txt').filter(r=>routeIds.has(r.route_id));const stops=rows('stops.txt').filter(s=>inBounds([+s.stop_lon,+s.stop_lat]));
for(const required of ['agency.txt','routes.txt','trips.txt','stops.txt','stop_times.txt'])if(!rows(required).length)throw Error(`Missing or empty GTFS ${required}`);
// Place names label the far side of loop routes; features.json comes from the geography build.
const places=await readFile('public/data/features.json','utf8').then(t=>JSON.parse(t).places??[]).catch(()=>[]);
if(!places.length)console.warn('No place names in public/data/features.json; loop routes keep their final-stop destination.');
const timetable=compileTimetable(rows,provenance,version,places);
const network={...provenance,version,shapes,trips,routes,stops,calendar:rows('calendar.txt'),calendarDates:rows('calendar_dates.txt')};
const previous=await readFile('public/data/bus-stops.json','utf8').then(JSON.parse).catch(()=>undefined);
validateGtfs(network,timetable.index,timetable.files,previous,Date.now(),timetable.summary);
const feedInfo=rows('feed_info.txt')[0];
const metadata={schema:1,contentHash,version,compiler:TIMETABLE_COMPILER,...provenance,validFrom:timetable.index.validFrom,validUntil:timetable.index.validUntil,...(shapeSource?{derivedShapes:shapeSource}:{}),feedInfo:feedInfo?{version:feedInfo.feed_version,startDate:feedInfo.feed_start_date,endDate:feedInfo.feed_end_date}:undefined};
timetable.index.version=version;timetable.index.feedInfo=metadata.feedInfo;
await writeFile(`${dest}/gtfs-metadata.json`,JSON.stringify(metadata));
await rm(`${dest}/timetables`,{recursive:true,force:true});await mkdir(`${dest}/timetables/${version}`,{recursive:true});
for(const [file,data] of timetable.files)await writeFile(`${dest}/timetables/${version}/${file}`,JSON.stringify(data));
await writeFile(`${dest}/timetables/${version}/${timetable.summaryFile}`,JSON.stringify(timetable.summary));
await writeFile(`${dest}/bus-stops.json`,JSON.stringify(timetable.index));
await writeFile(`${dest}/bus-network.json`,JSON.stringify(network));
console.log(`${Object.keys(shapes).length} shapes, ${trips.length} trips, ${routes.length} routes, ${stops.length} stops`);

console.log(`${timetable.index.stops.length} verified stops, ${timetable.files.size} timetable files, ${timetable.summary.trips.length} journeys in the service summary, valid ${timetable.index.validFrom}–${timetable.index.validUntil}`);
