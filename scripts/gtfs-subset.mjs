import {spawn,spawnSync} from 'node:child_process';
import {parse} from 'csv-parse';
import {zipSync,strToU8} from 'fflate';

// BODS publishes GTFS by region only, so the South East file carries every operator in the region.
// Stream it file by file (stop_times.txt is far too large to hold as one string) and keep a single operator.
const csvCell=v=>/[",\r\n]/.test(v)?`"${v.replaceAll('"','""')}"`:v;
const csvLine=cells=>cells.map(csvCell).join(',')+'\n';

/**
 * @param {(name:string)=>AsyncIterable<string[]>|undefined} open yields the header row, then each record
 * @param {{noc:string,name:RegExp}} operator
 * @returns {Promise<Record<string,string>>} filtered GTFS files as CSV text
 */
export async function subsetGtfs(open,operator){
 const out={};
 async function filter(name,keep){
  const rows=open(name);if(!rows)return;
  let header,text='';
  for await(const row of rows){
   if(!header){header=row.map(h=>h.replace(/^﻿/,'').trim());text=csvLine(header);continue;}
   const record=Object.fromEntries(header.map((h,i)=>[h,row[i]??'']));
   if(keep(record))text+=csvLine(row);
  }
  if(header)out[name]=text;
 }
 const agencies=new Set(),routes=new Set(),trips=new Set(),services=new Set(),shapes=new Set(),stops=new Set();
 await filter('agency.txt',a=>{const match=a.agency_noc?a.agency_noc.toUpperCase()===operator.noc:operator.name.test(a.agency_name);if(match)agencies.add(a.agency_id);return match;});
 if(!agencies.size)throw Error(`No ${operator.noc} agency in the BODS GTFS`);
 await filter('routes.txt',r=>{const keep=agencies.has(r.agency_id);if(keep)routes.add(r.route_id);return keep;});
 await filter('trips.txt',t=>{const keep=routes.has(t.route_id);if(keep){trips.add(t.trip_id);services.add(t.service_id);if(t.shape_id)shapes.add(t.shape_id);}return keep;});
 await filter('stop_times.txt',s=>{const keep=trips.has(s.trip_id);if(keep)stops.add(s.stop_id);return keep;});
 await filter('frequencies.txt',f=>trips.has(f.trip_id));
 await filter('calendar.txt',c=>services.has(c.service_id));
 await filter('calendar_dates.txt',c=>services.has(c.service_id));
 await filter('shapes.txt',s=>shapes.has(s.shape_id));
 const parents=new Set();
 await filter('stops.txt',s=>{const keep=stops.has(s.stop_id);if(keep&&s.parent_station)parents.add(s.parent_station);return keep;});
 if(parents.size)await filter('stops.txt',s=>stops.has(s.stop_id)||parents.has(s.stop_id));
 await filter('feed_info.txt',()=>true);
 if(!trips.size)throw Error(`BODS GTFS has no ${operator.noc} trips`);
 return out;
}

// Reads a member of a zip on disk as CSV records via the system unzip tool, so memory stays bounded.
export function zipCsvReader(zipPath){
 const list=spawnSync('unzip',['-Z1',zipPath],{encoding:'utf8',maxBuffer:1<<24});
 if(list.status!==0)throw Error(`Cannot list ${zipPath}: ${list.stderr.trim()||'is unzip installed?'}`);
 const members=new Map(list.stdout.split('\n').filter(Boolean).map(p=>[p.split('/').at(-1),p]));
 return name=>{
  const member=members.get(name);if(!member)return undefined;
  const child=spawn('unzip',['-p',zipPath,member],{stdio:['ignore','pipe','inherit']});
  const done=new Promise((resolve,reject)=>child.on('close',code=>code===0?resolve():reject(Error(`unzip ${member} exited ${code}`))));
  return (async function*(){yield* child.stdout.pipe(parse({relax_column_count:true,bom:true}));await done;})();
 };
}

export const zipGtfs=files=>zipSync(Object.fromEntries(Object.entries(files).map(([n,t])=>[n,strToU8(t)])),{level:6});
