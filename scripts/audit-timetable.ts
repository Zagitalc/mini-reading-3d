import {readFileSync} from 'node:fs';
import {scheduledDepartures,serviceOrigin,parseGtfsTime,type StopIndex,type StopTimetable} from '../shared/timetable';
import {gtfsContentHash} from './gtfs-validation';
import {unzipSync,strFromU8} from 'fflate';
import {parse} from 'csv-parse/sync';
// Expectations are manually transcribed from visually reviewed PDFs, never generated from GTFS.
// A discrepancy stays reported when a later dated operator publication shows the PDF is out of date; the
// cited resolution only stops it failing the audit. Expected times are never edited to match GTFS.
interface AuditCase {id:string;routeId:string;serviceDate:string;pdf:string;page:number;stopId:string;stopLabel:string;fromTime:string;toTime:string;expected:string[];note:string;resolution?:{status:'pdf-superseded';checked:string;evidence:string}}
const fixture: {sources:Record<string,unknown>;cases:AuditCase[]}=JSON.parse(readFileSync('tests/fixtures/timetable-audit/reading-2026-09-26.json','utf8'));
const index:StopIndex=JSON.parse(readFileSync('public/data/bus-stops.json','utf8'));
const metadata=JSON.parse(readFileSync('public/data/gtfs-metadata.json','utf8'));
const rawIndex=process.argv.indexOf('--raw');
let raw:Record<string,Record<string,string>[]>|undefined;
if(rawIndex>=0){
 if(!process.argv[rawIndex+1])throw Error('Usage: --raw path/to/gtfs.zip');
 const archive=unzipSync(readFileSync(process.argv[rawIndex+1]));
 if(gtfsContentHash(archive)!==metadata.contentHash)throw Error('Raw GTFS content hash does not match the bundled dataset');
 raw=Object.fromEntries(Object.entries(archive).filter(([n])=>n.endsWith('.txt')).map(([n,b])=>[n,parse(strFromU8(b),{columns:true,skip_empty_lines:true})]));
}
const clock=(seconds:number)=>`${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}`;
const seconds=(s:string)=>{const n=parseGtfsTime(s+':00');if(n===undefined)throw Error('Invalid fixture time '+s);return n;};
const difference=(a:string[],b:string[])=>{const remaining=[...b];return a.filter(v=>{const i=remaining.indexOf(v);if(i<0)return true;remaining.splice(i,1);return false;});};
const results=fixture.cases.map(c=>{
 const stop=index.stops.find(s=>s.id===c.stopId);if(!stop?.timetableUrl)throw Error('Missing audited stop '+c.stopId);
 if(c.serviceDate<index.validFrom||c.serviceDate>index.validUntil)throw Error('Audit date outside bundled coverage: '+c.serviceDate);
 const data:StopTimetable=JSON.parse(readFileSync('public'+stop.timetableUrl,'utf8'));
 const origin=serviceOrigin(c.serviceDate),from=seconds(c.fromTime),to=seconds(c.toTime);
 const departures=scheduledDepartures(data,origin+from*1000,(to-from)/3600,Number.MAX_SAFE_INTEGER).filter(d=>d.routeId===c.routeId&&d.serviceDate===c.serviceDate);
 const actual=departures.map(d=>clock((d.time-origin)/1000));
 let rawMatches:boolean|undefined;
 if(raw){
  // Independently select raw services by calendar weekday and dated exceptions.
  const weekday=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(`${c.serviceDate.slice(0,4)}-${c.serviceDate.slice(4,6)}-${c.serviceDate.slice(6)}T12:00Z`).getUTCDay()];
  const running=new Set((raw['calendar.txt']??[]).filter(s=>s.start_date<=c.serviceDate&&s.end_date>=c.serviceDate&&s[weekday]==='1').map(s=>s.service_id));
  for(const e of raw['calendar_dates.txt']??[])if(e.date===c.serviceDate){if(e.exception_type==='1')running.add(e.service_id);else running.delete(e.service_id);}
  const frequency=new Set((raw['frequencies.txt']??[]).map(r=>r.trip_id));
  const trips=new Set(raw['trips.txt'].filter(t=>t.route_id===c.routeId&&running.has(t.service_id)&&!frequency.has(t.trip_id)).map(t=>t.trip_id));
  const calls=raw['stop_times.txt'].filter(t=>trips.has(t.trip_id));
  const last=new Map<string,number>();for(const t of calls)last.set(t.trip_id,Math.max(last.get(t.trip_id)??-1,+t.stop_sequence));
  const expectedRaw=calls.filter(t=>t.stop_id===c.stopId&&t.pickup_type!=='1'&&+t.stop_sequence!==last.get(t.trip_id)&&t.departure_time).map(t=>({id:t.trip_id,sequence:+t.stop_sequence,time:parseGtfsTime(t.departure_time)!})).filter(t=>t.time>=from&&t.time<to).map(t=>`${t.id}|${t.sequence}|${t.time}`).sort();
  const observed=departures.map(d=>`${d.tripId}|${d.sequence}|${(d.time-origin)/1000}`).sort();
  rawMatches=JSON.stringify(expectedRaw)===JSON.stringify(observed);
 }
 return {...c,actual,approximateDepartures:departures.filter(d=>d.approximate).length,missing:difference(c.expected,actual),additional:difference(actual,c.expected),match:JSON.stringify(c.expected)===JSON.stringify(actual),rawMatches};
});
console.log(JSON.stringify({dataset:metadata.version,coverage:[index.validFrom,index.validUntil],sources:fixture.sources,summary:{cases:results.length,matching:results.filter(r=>r.match).length,discrepant:results.filter(r=>!r.match).length,explained:results.filter(r=>!r.match&&r.resolution).length,expectedDepartures:results.reduce((n,r)=>n+r.expected.length,0),rawChecks:results.filter(r=>r.rawMatches!==undefined).length,rawFailures:results.filter(r=>r.rawMatches===false).length},results},null,2));
if(results.some(r=>(!r.match&&!r.resolution)||r.rawMatches===false))process.exitCode=1;
