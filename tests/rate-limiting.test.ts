import {test, type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server/app';

async function serve(t:TestContext) {
 const {app,close,store}=await createApp({env:{STREET_MANAGER_ENABLED:'true'},database:':memory:',startPolling:false});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));close();});
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const get=async(path:string,init?:RequestInit)=>{
  const response=await fetch(base+path,init);
  await response.arrayBuffer();
  return response;
 };
 return {get,store};
}

test('API budget blocks database work, provider requests and SNS body parsing; expires after a minute',async t=>{
 const {get,store}=await serve(t);
 for(let i=0;i<300;i++)assert.equal((await get('/api/v1/config')).status,200);
 const active=t.mock.method(store,'active');
 const blocked=await get('/api/v1/health');
 assert.equal(blocked.status,429);
 assert.ok(Number(blocked.headers.get('Retry-After'))>0);
 assert.ok(blocked.headers.has('RateLimit'));
 assert.equal(active.mock.callCount(),0,'blocked health must not read the database');
 assert.equal((await get('/api/v1/traffic-tiles/12/2036/1362')).status,429);
 // Exceeds the body parser's 1 MB limit: rate limiting must run before parsing.
 assert.equal((await get('/api/v1/ingest/street-manager',{method:'POST',body:'x'.repeat(1_048_577)})).status,429);
 for(let i=0;i<3;i++)assert.equal((await get('/api/v1/config',{
  headers:{'X-Forwarded-For':`192.0.2.${i+1}`,'Forwarded':`for=192.0.2.${i+1}`,'CF-Connecting-IP':`192.0.2.${i+1}`},
 })).status,429,'untrusted headers must not create a fresh client budget');
 assert.equal((await get('/data/manifest.json',{method:'HEAD'})).status,200,'API exhaustion must leave map assets available');
 t.mock.timers.enable({apis:['Date'],now:Date.now()+60_001});
 assert.equal((await get('/api/v1/health')).status,200,'expired budgets must allow clients to recover');
 assert.equal(active.mock.callCount(),1);
});

test('static files and the root fallback are rate limited without blocking normal map bursts',async t=>{
 const {get}=await serve(t);
 for(let i=0;i<1200;i++)assert.equal((await get('/data/manifest.json',{method:'HEAD'})).status,200);
 for(const path of ['/data/manifest.json','/','/index.html']){
  const blocked=await get(path,{method:'HEAD'});
  assert.equal(blocked.status,429);
  assert.ok(Number(blocked.headers.get('Retry-After'))>0);
 }
});
