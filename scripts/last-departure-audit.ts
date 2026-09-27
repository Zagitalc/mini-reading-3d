import {lastDepartures,parseGtfsTime,serviceOrigin,type StopIndex,type StopTimetable} from '../shared/timetable';
/**
 * A last-departure check against a dated operator publication. `reference` stays null until someone reads
 * the operator source for that service date; the audit then reports the case as unverified, never as passing.
 * Reference times are transcribed by hand and use GTFS notation (24:46 is 00:46 the following morning).
 * They must never be generated from GTFS.
 */
export interface LastDepartureCase {
 id:string;serviceDate:string;stopId:string;stopLabel:string;routeLabel:string;headsign:string;why:string;
 reference:null|{time:string;kind:'stop-board'|'route-timetable'|'pdf';url:string;read:string;note?:string};
 resolution?:{status:'reference-superseded';checked:string;evidence:string};
}
export type LastDepartureStatus='match'|'discrepant'|'unverified'|'outside-coverage'|'missing-in-timetable';
export interface LastDepartureResult {id:string;status:LastDepartureStatus;timetable?:string;reference?:string;explained?:boolean;count?:number;detail:string}
const hhmm=(seconds:number)=>`${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}`;

export function auditLastDeparture(c:LastDepartureCase,index:Pick<StopIndex,'validFrom'|'validUntil'|'timezone'|'routes'>,data:StopTimetable|undefined):LastDepartureResult{
 if(c.serviceDate<index.validFrom||c.serviceDate>index.validUntil)return {id:c.id,status:'outside-coverage',detail:`Service date ${c.serviceDate} is outside ${index.validFrom}–${index.validUntil}.`};
 const groups=data?lastDepartures(data,index,c.serviceDate).groups.filter(g=>(index.routes[g.routeId]?.label??g.routeId)===c.routeLabel&&g.headsign===c.headsign):[];
 if(!groups.length)return {id:c.id,status:'missing-in-timetable',detail:`No boarding departure for route ${c.routeLabel} to "${c.headsign}" on this service date.`};
 // One label and destination can span timetable directions (for example a loop); the latest is the last bus.
 const last=groups.reduce((a,b)=>b.last.time>a.last.time?b:a),timetable=hhmm((last.last.time-serviceOrigin(c.serviceDate,index.timezone))/1000),count=groups.reduce((n,g)=>n+g.count,0);
 if(!c.reference)return {id:c.id,status:'unverified',timetable,count,detail:'No dated operator reference recorded yet.'};
 const expected=parseGtfsTime(c.reference.time+':00');if(expected===undefined)throw Error(`Invalid reference time in ${c.id}`);
 const match=hhmm(expected)===timetable;
 return {id:c.id,status:match?'match':'discrepant',timetable,reference:hhmm(expected),count,...(!match?{explained:!!c.resolution}:{}),detail:match?'Timetable agrees with the dated reference.':`Timetable ${timetable}, reference ${hhmm(expected)}.`};
}
