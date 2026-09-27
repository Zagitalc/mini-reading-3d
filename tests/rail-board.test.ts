import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchRailSnapshot,parseRdmBoard,summariseBoard} from '../server/providers/trains';
import {RailNetwork,STATIONS} from '../server/rail-network';
import {createApp} from '../server/app';

const generatedAt='2026-09-27T17:05:00.000Z';
const services=[
 {serviceID:'a',serviceType:'train',std:'18:10',etd:'On time',platform:'9',operator:'GWR',destination:[{locationName:'London Paddington',crs:'PAD'}]},
 {serviceID:'b',serviceType:'train',std:'18:12',etd:'18:19',operator:'CrossCountry',delayReason:'This train has been delayed by <b>a signalling fault</b>',destination:[{locationName:'Manchester Piccadilly',crs:'MAN',via:'via Birmingham'}]},
 {serviceID:'c',serviceType:'train',std:'18:15',etd:'Cancelled',isCancelled:true,cancelReason:'This train has been cancelled because of a shortage of train crew',operator:'South Western Railway',destination:[{locationName:'London Waterloo',crs:'WAT'}]},
 {serviceID:'arrival',serviceType:'train',sta:'18:20',eta:'On time',operator:'GWR',destination:[{locationName:'Reading',crs:'RDG'}]},
 {serviceID:'bus',serviceType:'bus',std:'18:25',etd:'On time',operator:'GWR',destination:[{locationName:'Didcot Parkway'}]},
];
const board={crs:'RDG',generatedAt,nrccMessages:[{Value:'Disruption between <a href="x">Twyford</a> and Maidenhead.'}],trainServices:services};

test('the station board keeps passenger fields and drops arrivals, replacement buses and markup',()=>{
 const summary=summariseBoard(parseRdmBoard(board,'RDG'),'RDG');
 assert.equal(summary.name,'Reading');assert.equal(summary.generatedAt,generatedAt);
 assert.deepEqual(summary.services.map(s=>s.id),['a','b','c']);
 assert.deepEqual(summary.services[0],{id:'a',scheduled:'18:10',expected:'On time',destination:'London Paddington',platform:'9',operator:'GWR',cancelled:false});
 assert.equal(summary.services[1].expected,'18:19');assert.equal(summary.services[1].via,'via Birmingham');assert.equal(summary.services[1].platform,undefined);
 assert.equal(summary.services[1].reason,'This train has been delayed by a signalling fault');
 assert.equal(summary.services[2].cancelled,true);assert.equal(summary.services[2].expected,'Cancelled');assert.match(summary.services[2].reason!,/shortage of train crew/);
 assert.deepEqual(summary.messages,['Disruption between Twyford and Maidenhead.']);
});

test('the shared rail refresh returns the Reading board without extra provider calls',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async(input:string|URL)=>{calls++;const crs=String(input).match(/\/([A-Z]{3})\?/)![1];return Response.json({crs,generatedAt,trainServices:crs==='RDG'?services:null});});
 const rail=new RailNetwork([{properties:{railway:'rail'},geometry:{type:'LineString',coordinates:[STATIONS.RDG,STATIONS.RDW]}}]);
 const result=await fetchRailSnapshot({rdmKey:'fixture'},rail,Date.parse(generatedAt));
 assert.equal(calls,Object.keys(STATIONS).length,'one request per station, as before');
 assert.deepEqual(Object.keys(result.boards),['RDG']);assert.equal(result.boards.RDG.services.length,3);
});

test('the local API serves the board only when rail credentials are configured',async()=>{
 for(const [env,configured] of [[{},false],[{RDM_API_KEY:'fixture'},true]] as const){
  const {app,close}=await createApp({env,database:':memory:',startPolling:false});const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',()=>r()));
  try{const address=server.address() as {port:number};const body=await (await fetch(`http://127.0.0.1:${address.port}/api/v1/rail-board`)).json();
   assert.deepEqual(body,{version:1,configured,board:null});
  }finally{server.close();close();}
 }
});
