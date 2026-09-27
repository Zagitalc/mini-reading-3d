import test from 'node:test';import assert from 'node:assert/strict';
import{mkdtemp,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';
import{zipSync,unzipSync,strToU8,strFromU8}from'fflate';
import{parse}from'csv-parse/sync';
// @ts-expect-error plain ES module shared with the download script
import{subsetGtfs,zipCsvReader,zipGtfs}from'../scripts/gtfs-subset.mjs';

// A regional BODS-style feed: two operators sharing a stop, a quoted stop name and a parent station.
const region:Record<string,string>={
 'agency.txt':'agency_id,agency_name,agency_url,agency_timezone,agency_noc\nOP1,Reading Buses,https://example.org,Europe/London,RBUS\nOP2,Other Buses,https://example.org,Europe/London,OTHR\n',
 'routes.txt':'route_id,agency_id,route_short_name,route_type\nR17,OP1,17,3\nX1,OP2,X1,3\n',
 'trips.txt':'route_id,service_id,trip_id,shape_id\nR17,S1,T1,SH1\nX1,S2,T2,SH2\n',
 'stop_times.txt':'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,24:46:00,24:46:00,A,0\nT1,24:50:00,24:50:00,B,1\nT2,10:00:00,10:00:00,B,0\nT2,10:05:00,10:05:00,C,1\n',
 'stops.txt':'stop_id,stop_name,stop_lat,stop_lon,parent_station\nA,"Blagrave Street, Stop EO",51.45,-0.97,P\nB,Cemetery Junction,51.45,-0.95,\nC,Elsewhere,51.2,-1.3,\nP,Blagrave Street,51.45,-0.97,\n',
 'calendar.txt':'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS1,0,0,0,0,0,0,1,20260920,20261025\nS2,1,1,1,1,1,0,0,20260920,20261025\n',
 'calendar_dates.txt':'service_id,date,exception_type\nS2,20261001,2\n',
 'shapes.txt':'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nSH1,51.45,-0.97,0\nSH1,51.45,-0.95,1\nSH2,51.45,-0.95,0\nSH2,51.2,-1.3,1\n',
};
const rows=(files:Record<string,string>,name:string)=>parse(files[name],{columns:true}) as Record<string,string>[];
const memory=(files:Record<string,string>)=>(name:string)=>files[name]===undefined?undefined:(async function*(){yield* parse(files[name]) as string[][];})();
const operator={noc:'RBUS',name:/^Reading Buses$/i};

test('BODS subset keeps only the chosen operator and everything its trips reference',async()=>{
 const out=await subsetGtfs(memory(region),operator);
 assert.deepEqual(rows(out,'routes.txt').map(r=>r.route_id),['R17']);
 assert.deepEqual(rows(out,'trips.txt').map(r=>r.trip_id),['T1']);
 assert.deepEqual(rows(out,'stop_times.txt').map(r=>r.departure_time),['24:46:00','24:50:00'],'after-midnight times survive unchanged');
 assert.deepEqual(rows(out,'stops.txt').map(r=>r.stop_id),['A','B','P'],'shared stop kept, parent station kept, other operator stop dropped');
 assert.equal(rows(out,'stops.txt')[0].stop_name,'Blagrave Street, Stop EO');
 assert.deepEqual(rows(out,'calendar.txt').map(r=>r.service_id),['S1']);
 assert.equal(rows(out,'calendar_dates.txt').length,0);
 assert.deepEqual([...new Set(rows(out,'shapes.txt').map(r=>r.shape_id))],['SH1']);
 assert.equal(out['frequencies.txt'],undefined);
});

test('BODS subset falls back to the agency name and fails loudly when the operator is absent',async()=>{
 const noNoc={...region,'agency.txt':'agency_id,agency_name,agency_url,agency_timezone\nOP1,Reading Buses,https://example.org,Europe/London\n'};
 assert.deepEqual(rows(await subsetGtfs(memory(noNoc),operator),'trips.txt').map(r=>r.trip_id),['T1']);
 await assert.rejects(subsetGtfs(memory(region),{noc:'NONE',name:/^Nobody$/}),/No NONE agency/);
});

test('zip reader streams members from disk and the subset round-trips through a zip',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gtfs-subset-'));
 try{
  const zip=join(dir,'region.zip');
  await writeFile(zip,zipSync(Object.fromEntries(Object.entries(region).map(([n,t])=>[`gtfs/${n}`,strToU8('﻿'+t)]))));
  const archive=unzipSync(zipGtfs(await subsetGtfs(zipCsvReader(zip),operator)));
  assert.deepEqual(Object.keys(archive).sort(),['agency.txt','calendar.txt','calendar_dates.txt','routes.txt','shapes.txt','stop_times.txt','stops.txt','trips.txt']);
  assert.match(strFromU8(archive['stops.txt']),/"Blagrave Street, Stop EO"/);
  assert.equal(parse(strFromU8(archive['agency.txt']),{columns:true}).length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
