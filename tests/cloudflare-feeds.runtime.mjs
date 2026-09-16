import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const calls={bus:0,weather:0,fuel:0,traffic:0};
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{modules:true,scriptPath:'dist-worker/index.js',compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'feeds-test'},bindings:{BODS_API_KEY:'fixture',TOMTOM_API_KEY:'fixture',TOMTOM_MONTHLY_TILE_LIMIT:'2',WEATHER_ENABLED:'true',FUEL_ENABLED:'true'},serviceBindings:{ASSETS:()=>new Response('missing asset',{status:503})},outboundService:request=>{
 const url=new URL(request.url),now=new Date().toISOString();
 if(url.hostname==='data.bus-data.dft.gov.uk'){calls.bus++;return new Response(`<Siri><ServiceDelivery><VehicleMonitoringDelivery><VehicleActivity><RecordedAtTime>${now}</RecordedAtTime><MonitoredVehicleJourney><VehicleRef>701</VehicleRef><OperatorRef>RBUS</OperatorRef><PublishedLineName>17</PublishedLineName><VehicleLocation><Longitude>-0.97</Longitude><Latitude>51.455</Latitude></VehicleLocation></MonitoredVehicleJourney></VehicleActivity></VehicleMonitoringDelivery></ServiceDelivery></Siri>`);}
 if(url.hostname==='api.open-meteo.com'){calls.weather++;return Response.json({current:{time:Math.floor(Date.now()/1000),interval:900,temperature_2m:15,cloud_cover:80,rain:.2,showers:0,snowfall:0,weather_code:61,wind_speed_10m:12,wind_direction_10m:180,is_day:1}});}
 if(url.hostname==='cheapfuelnearme.uk'){calls.fuel++;return Response.json({source_generated_at:now,stations:[{id:'f',name:'Test fuel',brand:'Test',postcode:'RG1',lat:51.45,lon:-.97,site_quiet:false,prices:{E10:{pence_per_litre:140.9,submitted_at:now}}}]});}
 if(url.hostname==='api.tomtom.com'){calls.traffic++;assert.equal(request.headers.get('TomTom-Api-Key'),'fixture');return new Response(new Uint8Array([1,2]));}
 throw Error('Unexpected outbound request '+url.hostname);
}}]}));
try{
 const db=await mf.getD1Database('DB');for(const s of (await readFile('migrations/0001_initial.sql','utf8')).split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const get=path=>mf.dispatchFetch('http://local'+path);
 const worker=await mf.getWorker();const tick=await worker.scheduled({cron:'* * * * *'});assert.equal(tick.outcome,'ok');
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
 console.log('Worker feeds: durable buses without geometry, weather/fuel, cron deduplication, tile cache, quota and geographic limits passed.',calls);
}finally{await mf.dispose();}
