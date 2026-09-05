import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { generateKeyPairSync, sign } from 'node:crypto';

const {privateKey,publicKey} = generateKeyPairSync('rsa',{modulusLength:2048});
const pem = publicKey.export({type:'spki',format:'pem'});
const topic = 'arn:aws:sns:eu-west-2:287813576808:prod-permit-topic';
function envelope(id, raw) {
  const message = {Type:'Notification',MessageId:id,Message:JSON.stringify(raw),Timestamp:new Date().toISOString(),TopicArn:topic,
    SignatureVersion:'2',SigningCertURL:'https://sns.eu-west-2.amazonaws.com/SimpleNotificationService-test.pem'};
  const canonical=['Message','MessageId','Timestamp','TopicArn','Type'].map(key=>`${key}\n${message[key]}\n`).join('');
  return {...message,Signature:sign('RSA-SHA256',Buffer.from(canonical),privateKey).toString('base64')};
}

const mf = new Miniflare({workers:[{
  modules: true, scriptPath: 'dist-worker/index.js',
  compatibilityDate: '2026-08-06', compatibilityFlags: ['nodejs_compat'],
  d1Databases: {DB: 'test-db'},
  bindings: {STREET_MANAGER_ENABLED: 'true', BODS_API_KEY: 'test-only'},
  serviceBindings: {ASSETS: () => new Response('static asset')},
  outboundService: request => {
    assert.equal(new URL(request.url).hostname,'sns.eu-west-2.amazonaws.com');
    return new Response(pem);
  },
}]});
try {
  const db = await mf.getD1Database('DB');
  const sql = await readFile('migrations/0001_initial.sql','utf8');
  for (const statement of sql.split(';').map(x=>x.trim()).filter(Boolean)) await db.prepare(statement).run();
  const get = async path => (await mf.dispatchFetch(`http://local${path}`)).json();
  const health = await get('/api/v1/health');
  assert.equal(health.data.length,4);
  assert.equal(health.data[0].state,'connecting');
  assert.equal(health.data[1].state,'unavailable');
  assert.deepEqual((await get('/api/v1/vehicles')).data,[]);
  const now = new Date().toISOString();
  const vehicle = {id:'test',observedAt:now};
  await db.prepare('INSERT INTO feed_items VALUES(?,?,?)').bind('buses','0',JSON.stringify([vehicle,{id:'old',observedAt:'2020-01-01T00:00:00Z'}])).run();
  assert.deepEqual((await get('/api/v1/vehicles')).data,[vehicle]);
  await db.prepare('INSERT INTO state VALUES(?,?)').bind('buses',JSON.stringify({id:'buses',label:'Buses',lastSuccess:'2020-01-01T00:00:00Z',state:'live',count:2,intervalMs:60000})).run();
  const stale = (await get('/api/v1/health')).data[0];
  assert.equal(stale.state,'stale'); assert.equal(stale.count,0);
  const response = await mf.dispatchFetch('http://local/api/v1/ingest/street-manager',{method:'POST',body:JSON.stringify({Type:'Notification',TopicArn:'untrusted'})});
  assert.equal(response.status,400);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM sns_messages').first()).n,0);
  const raw={object_type:'PERMIT',object_reference:'test-01',event_type:'WORK_START',event_time:now,version:1,
    object_data:{work_reference_number:'test',works_location_coordinates:'POINT(471500 173500)',street_name:'Test street',traffic_management_type:'Road closure',actual_start_date_time:now}};
  const post = async message => mf.dispatchFetch('http://local/api/v1/ingest/street-manager',{method:'POST',body:JSON.stringify(message)});
  const signed = envelope('signed-test',raw);
  assert.equal((await post(signed)).status,200);
  assert.equal((await get('/api/v1/road-events')).data.length,1);
  assert.deepEqual(await (await post(signed)).json(),{duplicate:true});
  assert.equal((await post(envelope('cancel-test',{...raw,event_type:'PERMIT_CANCELLED',version:2}))).status,200);
  assert.equal((await get('/api/v1/road-events')).data.length,0);
  await post(envelope('old-test',raw));
  assert.equal((await get('/api/v1/road-events')).data.length,0,'older event must not revive cancellation');
  assert.equal((await get('/api/v1/health')).data[2].state,'live');
  const oversized = await mf.dispatchFetch('http://local/api/v1/ingest/street-manager',{method:'POST',body:'x'.repeat(1048577)});
  assert.equal(oversized.status,413);
  assert.equal((await mf.dispatchFetch('http://local/api/missing')).status,404);
  assert.equal((await mf.dispatchFetch('http://local/api/v1/ingest/street-manager')).status,405);
  assert.equal(await (await mf.dispatchFetch('http://local/')).text(),'static asset');
  console.log('Cloudflare runtime: D1 migrations, feed freshness, API routing, signed SNS verification, duplicate delivery, cancellation ordering and size limits passed.');
} finally { await mf.dispose(); }
