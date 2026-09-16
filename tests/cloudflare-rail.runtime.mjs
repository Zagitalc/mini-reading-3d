import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
let calls=0,status=200;
const coordinates=[[-.9723182,51.4592197],[-.981,51.457],[-.9907169,51.4546483]];
const time=offset=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(Date.now()+offset*60000);
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{modules:true,scriptPath:'dist-worker/index.js',compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'rail-test'},bindings:{RDM_API_KEY:'fixture-rdm'},serviceBindings:{ASSETS:()=>Response.json({features:[{properties:{railway:'rail'},geometry:{type:'LineString',coordinates}}]})},outboundService:request=>{
 calls++;const url=new URL(request.url);assert.equal(url.hostname,'api1.raildata.org.uk');assert.equal(request.headers.get('x-apikey'),'fixture-rdm');assert.equal(url.searchParams.get('timeOffset'),'-5');
 if(status!==200)return new Response('private provider error',{status});
 const crs=url.pathname.split('/').at(-1);return Response.json({crs,generatedAt:new Date().toISOString(),trainServices:crs==='RDG'?[{serviceID:'train-test',std:time(-2),etd:'On time',operator:'GWR',destination:[{locationName:'Reading West'}],subsequentCallingPoints:[{callingPoint:[{crs:'RDW',st:time(3),et:'On time'}]}]}]:null});
}}]}));
try{
 const db=await mf.getD1Database('DB');for(const s of(await readFile('migrations/0001_initial.sql','utf8')).split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const worker=await mf.getWorker(),get=async path=>(await mf.dispatchFetch('http://local'+path)).json();
 await worker.scheduled({cron:'* * * * *'});assert.equal(calls,11);
 const snapshot=await get('/api/v1/vehicle-state');assert.equal(snapshot.data.length,1);assert.equal(snapshot.data[0].status,'estimated');assert.equal(snapshot.data[0].destination,'Reading West');assert.equal(snapshot.routes['train-test'].length,3);
 assert.equal((await get('/api/v1/vehicle-routes')).routes['train-test'].length,3,'RDM-only configuration exposes paths');
 assert.equal((await get('/api/v1/health')).data.find(f=>f.id==='trains').state,'live');
 await Promise.all([worker.scheduled({cron:'* * * * *'}),worker.scheduled({cron:'* * * * *'}),get('/api/v1/vehicles')]);assert.equal(calls,11,'cron and viewers share cached rail snapshots');
 const saved=JSON.parse((await db.prepare("SELECT body FROM state WHERE id='trains'").first()).body);
 await db.prepare("UPDATE state SET body=? WHERE id='trains'").bind(JSON.stringify({...saved,lastAttempt:new Date(Date.now()-3600000).toISOString()})).run();
 await db.prepare("UPDATE state SET body='0' WHERE id='poll-lease:trains'").run();status=401;
 await worker.scheduled({cron:'* * * * *'});assert.equal(calls,12,'one rejected key does not trigger eleven rejected requests');
 const health=(await get('/api/v1/health')).data.find(f=>f.id==='trains');assert.equal(health.state,'stale');assert.equal(health.message,'Rail provider returned HTTP 401');
 await worker.scheduled({cron:'* * * * *'});assert.equal(calls,12,'failed requests back off');
 console.log('RDM Worker: estimates, route visibility, shared polling, authentication failure and backoff passed.');
}finally{await mf.dispose();}
