import {readFile,writeFile}from'node:fs/promises';import{unzipSync,strFromU8}from'fflate';import{parse}from'csv-parse/sync';import{geometryIntersects,inBounds}from'../shared/geo';import type{LngLat}from'../shared/types';
const archive=unzipSync(new Uint8Array(await readFile('raw/reading-gtfs.zip')));
const rows=(file:string):Record<string,string>[]=>archive[file]?parse(strFromU8(archive[file]),{columns:true,skip_empty_lines:true,bom:true}):[];
const shapes:Record<string,LngLat[]>={};const grouped=new Map<string,Record<string,string>[]>();
for(const row of rows('shapes.txt')){if(!grouped.has(row.shape_id))grouped.set(row.shape_id,[]);grouped.get(row.shape_id)!.push(row);}
for(const[id,points]of grouped){const line=points.sort((a,b)=>+a.shape_pt_sequence-+b.shape_pt_sequence).map(p=>[+p.shape_pt_lon,+p.shape_pt_lat]as LngLat);if(geometryIntersects(line))shapes[id]=line;}
const trips=rows('trips.txt').filter(t=>shapes[t.shape_id]);const routeIds=new Set(trips.map(t=>t.route_id));const routes=rows('routes.txt').filter(r=>routeIds.has(r.route_id));const stops=rows('stops.txt').filter(s=>inBounds([+s.stop_lon,+s.stop_lat]));
await writeFile('public/data/bus-network.json',JSON.stringify({source:'Reading Buses',sourceUrl:'https://www.reading-buses.co.uk/open-data',licence:'OGL 3.0',retrievedAt:new Date().toISOString(),shapes,trips,routes,stops,calendar:rows('calendar.txt'),calendarDates:rows('calendar_dates.txt')}));
console.log(`${Object.keys(shapes).length} shapes, ${trips.length} trips, ${routes.length} routes, ${stops.length} stops`);
