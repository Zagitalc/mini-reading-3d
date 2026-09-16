import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const calls={bus:0,weather:0,fuel:0,traffic:0};let busStatus=200;
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{modules:true,scriptPath:'dist-worker/index.js',compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'feeds-test'},bindings:{BODS_API_KEY:'fixture',TOMTOM_API_KEY:'fixture',TOMTOM_MONTHLY_TILE_LIMIT:'2',WEATHER_ENABLED:'true',FUEL_ENABLED:'true'},serviceBindings:{ASSETS:()=>new Response('missing asset',{status:503})},outboundService:request=>{
 const url=new URL(request.url),now=new Date().toISOString();
 if(url.hostname==='data.bus-data.dft.gov.uk'){calls.bus++;assert.equal(url.pathname,'/api/v1/datafeed/');assert.match(request.headers.get('User-Agent'),/^MiniReading3D\//);assert.equal(request.headers.get('Accept'),'text/xml');if(busStatus!==200)return new Response('Unavailable',{status:busStatus});return new Response(`<Siri><ServiceDelivery><VehicleMonitoringDelivery><VehicleActivity><RecordedAtTime>${now}</RecordedAtTime><MonitoredVehicleJourney><VehicleRef>701</VehicleRef><OperatorRef>RBUS</OperatorRef><PublishedLineName>17</PublishedLineName><VehicleLocation><Longitude>-0.97</Longitude><Latitude>51.455</Latitude></VehicleLocation></MonitoredVehicleJourney></VehicleActivity></VehicleMonitoringDelivery></ServiceDelivery></Siri>`);}
 if(url.hostname==='api.open-meteo.com'){calls.weather++;return Response.json({current:{time:Math.floor(Date.now()/1000),interval:900,temperature_2m:15,cloud_cover:80,rain:.2,showers:0,snowfall:0,weather_code:61,wind_speed_10m:12,wind_direction_10m:180,is_day:1}});}
 if(url.hostname==='cheapfuelnearme.uk'){calls.fuel++;return Response.json({source_generated_at:now,stations:[{id:'f',name:'Test fuel',brand:'Test',postcode:'RG1',lat:51.45,lon:-.97,site_quiet:false,prices:{E10:{pence_per_litre:140.9,submitted_at:now}}}]});}
 if(url.hostname==='api.tomtom.com'){calls.traffic++;assert.equal(request.headers.get('TomTom-Api-Key'),'fixture');return new Response(new Uint8Array([1,2]));}
 throw Error('Unexpected outbound request '+url.hostname);
}}]}));
try{
 const db=await mf.getD1Database('DB');for(const s of (await readFile('migrations/0001_initial.sql','utf8')).split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const get=path=>mf.dispatchFetch('http://local'+path);
 const worker=await mf.getWorker();const tick=await worker.scheduled({cron:'* * * * *'});assert.equal(tick.outcome,'ok');assert.equal(calls.bus,0,'global cron must not call the geo-restricted BODS API');
 assert.equal((await (await get('/api/v1/vehicle-state')).json()).data.length,1,'bus survives unavailable route geometry');
 assert.equal((await (await get('/api/v1/weather')).json()).data.length,1);
 assert.equal((await (await get('/api/v1/fuel')).json()).data.length,1);
 await Promise.all([worker.scheduled({cron:'* * * * *'}),worker.scheduled({cron:'* * * * *'})]);assert.deepEqual(calls,{bus:1,weather:1,fuel:1,traffic:0},'repeat cron must not refetch early');
 assert.equal((await get('/api/v1/traffic-tiles/12/2036/1362')).status,200);assert.equal((await get('/api/v1/traffic-tiles/12/2036/1362')).status,200);assert.equal(calls.traffic,1,'cached tile must not spend quota');
 const usage=(await (await get('/api/v1/usage')).json());assert.equal(usage.trafficTileRequests,1);assert.equal(usage.trafficTileLimit,2);
 await db.prepare('UPDATE state SET body=? WHERE id=?').bind('{"count":2}','traffic-usage:'+new Date().toISOString().slice(0,7)).run();
 assert.equal((await get('/api/v1/traffic-tiles/12/2037/1362')).status,429);assert.equal(calls.traffic,1,'quota exhaustion must block upstream request');
 assert.equal((await get('/api/v1/traffic-tiles/12/0/0')).status,404);
 const weatherHealth=JSON.parse((await db.prepare('SELECT body FROM state WHERE id=?').bind('weather').first()).body);weatherHealth.lastSuccess=new Date(Date.now()-600000).toISOString();await db.prepare('UPDATE state SET body=? WHERE id=?').bind(JSON.stringify(weatherHealth),'weather').run();assert.equal((await (await get('/api/v1/health')).json()).data.find(f=>f.id==='weather').count,1,'slow feeds must not expire after the five-minute vehicle TTL');
 const busHealth=JSON.parse((await db.prepare('SELECT body FROM state WHERE id=?').bind('buses').first()).body);
 const allowBusRetry=async()=>{await db.prepare('UPDATE state SET body=? WHERE id=?').bind(JSON.stringify({...busHealth,lastAttempt:new Date(Date.now()-3600000).toISOString(),lastSuccess:new Date(Date.now()-180000).toISOString()}),'buses').run();await db.prepare('UPDATE state SET body=? WHERE id=?').bind('0','poll-lease:buses').run();};
 busStatus=503;await allowBusRetry();await get('/api/v1/vehicle-state');
 const failedHealth=(await(await get('/api/v1/health')).json()).data.find(f=>f.id==='buses');assert.equal(failedHealth.state,'stale');assert.equal(failedHealth.message,'Bus provider returned HTTP 503');assert.equal(failedHealth.failures,1);
 const failedCalls=calls.bus;await get('/api/v1/vehicle-state');assert.equal(calls.bus,failedCalls,'provider errors must retain retry backoff');
 busStatus=200;await allowBusRetry();const beforeRecovery=calls.bus;await Promise.all([get('/api/v1/vehicle-state'),get('/api/v1/vehicles'),get('/api/v1/vehicle-state')]);assert.equal(calls.bus,beforeRecovery+1,'concurrent viewers share a single provider request');const recovered=(await(await get('/api/v1/health')).json()).data.find(f=>f.id==='buses');assert.equal(recovered.state,'live');assert.equal(recovered.failures,undefined);
 console.log('Worker feeds: durable buses without geometry, weather/fuel, cron deduplication, tile cache, quota and geographic limits passed.',calls);
}finally{await mf.dispose();}
