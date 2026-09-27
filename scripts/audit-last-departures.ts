import {readFileSync} from 'node:fs';
import type {StopIndex,StopTimetable} from '../shared/timetable';
import {auditLastDeparture,type LastDepartureCase} from './last-departure-audit';
// Usage: npm run audit:last-departures [-- --markdown]
const fixture:{schema:1;cases:LastDepartureCase[]}=JSON.parse(readFileSync('tests/fixtures/transport-audit/last-departures.json','utf8'));
const index:StopIndex=JSON.parse(readFileSync('public/data/bus-stops.json','utf8'));
const results=fixture.cases.map(c=>{
 const stop=index.stops.find(s=>s.id===c.stopId);if(!stop)throw Error('Missing audited stop '+c.stopId);
 const data:StopTimetable|undefined=stop.timetableUrl?JSON.parse(readFileSync('public'+stop.timetableUrl,'utf8')):undefined;
 return {...auditLastDeparture(c,index,data),case:c};
});
const count=(status:string)=>results.filter(r=>r.status===status).length;
const summary={dataset:index.version,coverage:[index.validFrom,index.validUntil],cases:results.length,matching:count('match'),discrepant:count('discrepant'),explained:results.filter(r=>r.explained).length,unverified:count('unverified'),outsideCoverage:count('outside-coverage'),missingInTimetable:count('missing-in-timetable')};
if(process.argv.includes('--markdown')){
 const date=(d:string)=>`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`;
 console.log(`Dataset \`${summary.dataset}\`, coverage ${date(index.validFrom)} to ${date(index.validUntil)}. ${summary.matching} match, ${summary.discrepant} discrepant (${summary.explained} explained), ${summary.unverified} unverified, ${summary.outsideCoverage} outside coverage, ${summary.missingInTimetable} missing.\n`);
 console.log('| Case | Service date | Stop | Route → destination | Timetable last | Reference | Status |\n| --- | --- | --- | --- | --- | --- | --- |');
 for(const r of results)console.log(`| ${r.id} | ${date(r.case.serviceDate)} | ${r.case.stopLabel} | ${r.case.routeLabel} → ${r.case.headsign} | ${r.timetable??'–'} | ${r.reference??'–'} | ${r.status}${r.explained?' (explained)':''} |`);
}else console.log(JSON.stringify({summary,results},null,2));
// Unexplained discrepancies and cases the timetable cannot answer fail; unverified cases are reported, not failed.
if(results.some(r=>(r.status==='discrepant'&&!r.explained)||r.status==='missing-in-timetable'))process.exitCode=1;
