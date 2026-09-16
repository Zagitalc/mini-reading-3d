import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estimateBoard,fetchRailBoard,parseRdmBoard} from '../server/providers/trains';
import {RailNetwork,STATIONS} from '../server/rail-network';
import {feedFailureReason} from '../shared/feed-errors';

const now=Date.parse('2026-09-16T08:05:00Z');
const rail=new RailNetwork([{properties:{railway:'rail'},geometry:{type:'LineString',coordinates:[STATIONS.RDG,[-.981,51.457],STATIONS.RDW]}}]);
const service={serviceID:'rdm-train',serviceType:'train',std:'09:00',etd:'On time',operator:'GWR',destination:[{locationName:'Reading West',crs:'RDW'}],subsequentCallingPoints:[{serviceType:'train',callingPoint:[{crs:'RDW',st:'09:10',et:'On time'}]}]};
const board=(services:unknown[]=[service])=>({crs:'RDG',generatedAt:new Date(now).toISOString(),trainServices:services});

test('RDM JSON arrays produce timed estimates and destinations on connected track',()=>{
 const data=estimateBoard(parseRdmBoard(board(),'RDG'),'RDG',rail,now);
 assert.equal(data.observations.length,1);const train=data.observations[0];
 assert.equal(train.status,'estimated');assert.equal(train.destination,'Reading West');assert.equal(train.observedAt,new Date(now).toISOString());
 assert.ok(train.position[0]<STATIONS.RDG[0]&&train.position[0]>STATIONS.RDW[0]);assert.equal(data.routes['rdm-train'].length,3);
});

test('RDM cancellations, unknown delays, future departures and replacement buses do not become moving trains',()=>{
 const services=[{...service,isCancelled:true},{...service,serviceID:'delayed',etd:'Delayed'},
  {...service,serviceID:'future',std:'09:07'},{...service,serviceID:'bus',serviceType:'bus'}];
 const data=estimateBoard(parseRdmBoard(board(services),'RDG'),'RDG',rail,now);
 assert.equal(data.observations.length,1);assert.equal(data.observations[0].cancelled,true);
});

test('RDM station holds and midnight retain London timing',()=>{
 const held={...service,sta:'09:04',eta:'On time',std:'09:07'};
 assert.equal(estimateBoard(parseRdmBoard(board([held]),'RDG'),'RDG',rail,now).observations[0].stopUntil,'2026-09-16T08:07:00.000Z');
 const midnight=Date.parse('2026-09-16T23:01:00Z');
 const late={...service,std:'23:59',subsequentCallingPoints:[{callingPoint:[{crs:'RDW',st:'00:05',et:'On time'}]}]};
 assert.equal(estimateBoard(parseRdmBoard({...board([late]),generatedAt:new Date(midnight).toISOString()},'RDG'),'RDG',rail,midnight).observations.length,1);
});

test('RDM rejects error envelopes and mismatched stations but accepts empty boards',()=>{
 for(const input of [{error:'credential'}, {...board(),crs:'PAD'},{...board(),generatedAt:'invalid'},{...board(),trainServices:{}}])assert.throws(()=>parseRdmBoard(input,'RDG'),/unrecognised/);
 assert.deepEqual(parseRdmBoard({...board(),trainServices:null},'RDG').trainServices.service,[]);
 const split={...service,subsequentCallingPoints:[{...service.subsequentCallingPoints[0],serviceChangeRequired:true}]};
 assert.equal(estimateBoard(parseRdmBoard(board([split]),'RDG'),'RDG',rail,now).observations.length,0);
});

test('RDM authenticates only in headers, uses one detailed request, and does not fall back on rejection',async t=>{
 const requests:{url:string;options:RequestInit}[]=[];let status=200;
 t.mock.method(globalThis,'fetch',async(input:string|URL,options:RequestInit)=>{requests.push({url:String(input),options});return status===200?Response.json(board()):new Response('do not expose this secret response',{status});});
 await fetchRailBoard({rdmKey:'fixture-key',soapToken:'legacy'},'RDG');
 assert.equal(requests.length,1);const request=requests[0],url=new URL(request.url),headers=new Headers(request.options.headers);
 assert.equal(url.hostname,'api1.raildata.org.uk');assert.match(url.pathname,/GetDepBoardWithDetails\/RDG$/);assert.equal(url.searchParams.get('timeOffset'),'-5');assert.equal(url.searchParams.get('numRows'),'10');
 assert.equal(headers.get('x-apikey'),'fixture-key');assert.equal(request.options.redirect,'manual');assert.ok(!request.url.includes('fixture-key'));
 status=401;await assert.rejects(fetchRailBoard({rdmKey:'fixture-key',soapToken:'legacy'},'RDG'),/Rail provider returned HTTP 401/);assert.equal(requests.length,2);
 assert.equal(feedFailureReason(new Error('Rail provider returned HTTP 401')),'Rail provider returned HTTP 401');
 assert.equal(feedFailureReason(new Error('Rail provider returned HTTP 401 secret')),'Provider update failed');
});

test('legacy SOAP remains available when no RDM key is configured',async t=>{
 t.mock.method(globalThis,'fetch',async(input:string|URL,options:RequestInit)=>{assert.match(String(input),/OpenLDBWS\/ldb12.asmx/);assert.match(String(options.body),/<typ:TokenValue>legacy/);return new Response('<Envelope><Body><GetArrDepBoardWithDetailsResponse><GetStationBoardResult><generatedAt>2026-09-16T08:05:00Z</generatedAt></GetStationBoardResult></GetArrDepBoardWithDetailsResponse></Body></Envelope>');});
 assert.equal((await fetchRailBoard({soapToken:'legacy'},'RDG')).generatedAt,new Date(now).toISOString().replace('.000',''));
});
