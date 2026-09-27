import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditLastDeparture,type LastDepartureCase} from '../scripts/last-departure-audit';
import type {StopTimetable} from '../shared/timetable';

const index={validFrom:'20261001',validUntil:'20261031',timezone:'Europe/London',routes:{'9001':{label:'17',colour:'#000'}}};
const data:StopTimetable={schema:1,stopId:'s',timezone:'Europe/London',services:[{start:'20261001',end:'20261031',weekdays:'1111111',exceptions:{}}],
 trips:[{id:'a',service:0,routeId:'9001',headsign:'Wokingham Road',direction:'0'},{id:'b',service:0,routeId:'9001',headsign:'Wokingham Road',direction:'0'}],
 times:[[0,22*3600+40*60,1,1,0],[1,24*3600+46*60,1,1,0]]};
const base:LastDepartureCase={id:'c',serviceDate:'20261004',stopId:'s',stopLabel:'Blagrave Street',routeLabel:'17',headsign:'Wokingham Road',why:'test',reference:null};
const reference=(time:string)=>({time,kind:'stop-board' as const,url:'https://example.invalid',read:'2026-10-04T21:00:00Z'});

test('a case without an operator reference is unverified, not passing',()=>{
 const result=auditLastDeparture(base,index,data);
 assert.equal(result.status,'unverified');assert.equal(result.timetable,'24:46');assert.equal(result.count,2);
});

test('after-midnight references compare in service-day time',()=>{
 assert.equal(auditLastDeparture({...base,reference:reference('24:46')},index,data).status,'match');
 const wrong=auditLastDeparture({...base,reference:reference('24:49')},index,data);
 assert.equal(wrong.status,'discrepant');assert.equal(wrong.explained,false);
 assert.equal(auditLastDeparture({...base,reference:reference('24:49'),resolution:{status:'reference-superseded',checked:'2026-10-05',evidence:'x'}},index,data).explained,true);
});

test('coverage gaps and unknown destinations are reported distinctly',()=>{
 assert.equal(auditLastDeparture({...base,serviceDate:'20261101'},index,data).status,'outside-coverage');
 assert.equal(auditLastDeparture({...base,headsign:'Tilehurst'},index,data).status,'missing-in-timetable');
 assert.equal(auditLastDeparture(base,index,undefined).status,'missing-in-timetable');
});

test('the audit fixture never carries generated reference times',()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/transport-audit/last-departures.json','utf8'));
 const ids=new Set<string>();
 for(const c of fixture.cases as LastDepartureCase[]){
  assert.ok(!ids.has(c.id),`duplicate ${c.id}`);ids.add(c.id);assert.match(c.serviceDate,/^\d{8}$/);assert.ok(c.why);
  if(c.reference){assert.match(c.reference.time,/^\d\d:[0-5]\d$/);assert.match(c.reference.url,/^https:\/\//);assert.ok(Date.parse(c.reference.read));}
 }
});
