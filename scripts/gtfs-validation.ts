import {createHash} from 'node:crypto';
import {localDate,serviceRuns,type StopIndex,type StopTimetable} from '../shared/timetable';
import {validPosition} from '../shared/geo';
import type {ServiceSummary} from '../shared/scheduled-services';
import type {BusNetwork} from '../server/route-matcher';
export function gtfsContentHash(archive:Record<string,Uint8Array>){const hash=createHash('sha256');for(const name of Object.keys(archive).filter(n=>n.endsWith('.txt')).sort()){hash.update(name);hash.update('\0');hash.update(archive[name]);hash.update('\0');}return hash.digest('hex');}
export function validateGtfs(network:BusNetwork,index:StopIndex,files:Map<string,StopTimetable>,previous?:StopIndex,now=Date.now(),summary?:ServiceSummary){
 const today=localDate(now);
 if(index.validUntil<today)throw Error(`GTFS expired on ${index.validUntil}`);
 if(index.validFrom>today)throw Error(`GTFS does not start until ${index.validFrom}`);
 if(index.stops.length<500||network.routes.length<20||network.trips.length<1000||Object.keys(network.shapes).length<50)throw Error('GTFS local coverage unexpectedly small');
 if(previous&&(index.stops.length<previous.stops.length*.8||Object.keys(index.routes).length<Object.keys(previous.routes).length*.8))throw Error('GTFS lost more than 20% of local stops or routes; manual review required');
 if(![...files.values()].some(f=>f.services.some(s=>serviceRuns(s,today))))throw Error('GTFS has no local service today');
 for(const [id,line]of Object.entries(network.shapes))if(line.length<2||line.some(p=>!validPosition(p)))throw Error(`Invalid GTFS shape ${id}`);
 for(const t of network.trips)if(!network.shapes[t.shape_id]||!network.routes.some(r=>r.route_id===t.route_id))throw Error('GTFS has broken trip joins');
 for(const stop of index.stops){if(!validPosition(stop.position))throw Error('GTFS stop location invalid');if(stop.timetableUrl&&!files.has(stop.timetableUrl.split('/').at(-1)!))throw Error('GTFS stop timetable missing');}
 if(summary){if(!index.servicesUrl||summary.trips.length<1000)throw Error('GTFS service summary missing or unexpectedly small');const stopIds=new Set(index.stops.map(s=>s.id));for(const [service,routeId,,,start,end,stop]of summary.trips)if(!summary.services[service]||!index.routes[routeId]||!(start>=0&&end>=start)||!stopIds.has(stop))throw Error('GTFS service summary has broken references');}
 for(const file of files.values())for(const [trip,seconds]of file.times)if(!file.trips[trip]||!file.services[file.trips[trip].service]||!Number.isFinite(seconds)||seconds<0)throw Error('GTFS departure has broken references');
}
