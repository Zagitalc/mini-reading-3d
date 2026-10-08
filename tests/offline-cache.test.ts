import test from 'node:test';import assert from 'node:assert/strict';
(globalThis as unknown as {__MR_SW_TEST__:object}).__MR_SW_TEST__={};
await import(new URL('../public/sw.js',import.meta.url).href);
const {classify,NAMES,LIMITS}=(globalThis as unknown as {__MR_SW_TEST__:{exports:{classify:(p:string,m?:string)=>{strategy:string;cache?:string};NAMES:Record<string,string>;LIMITS:Record<string,number>}}}).__MR_SW_TEST__.exports;
test('live data is never cached and the worker itself is left alone',()=>{
 for(const p of ['/api/v1/fuel','/api/v1/vehicle-state','/api/v1/traffic-tiles/12/1/1.pbf','/sw.js'])assert.equal(classify(p).strategy,'pass',p);
});
test('tiles, timetables and static files are kept once seen',()=>{
 assert.deepEqual(classify('/data/tiles/14/8123/5441.pbf'),{strategy:'cache-first',cache:'tiles'});
 assert.deepEqual(classify('/data/timetables/69224eee502aaf00/23b455b63971461c05d2.json'),{strategy:'cache-first',cache:'timetables'});
 assert.deepEqual(classify('/assets/index-abc123.js'),{strategy:'cache-first',cache:'static'});
 assert.deepEqual(classify('/fonts/Noto%20Sans%20Regular/0-255.pbf'),{strategy:'cache-first',cache:'static'});
});
test('buildings refresh in the background, and the daily data files prefer the network',()=>{
 assert.deepEqual(classify('/data/chunks/17_19.json'),{strategy:'revalidate',cache:'chunks'});
 for(const p of ['/data/bus-stops.json','/data/manifest.json','/data/hygiene.json'])assert.deepEqual(classify(p),{strategy:'network-first',cache:'data'},p);
 assert.deepEqual(classify('/','navigate'),{strategy:'network-first',cache:'static'});
});
test('every cache has a name and a limit, and names carry the version',()=>{
 for(const k of Object.keys(NAMES)){assert.match(NAMES[k],/^mr-.*-v\d+$/);assert.ok(LIMITS[k]>0,k);}
 assert.ok(LIMITS.tiles>=551,'the whole tile set (551 tiles) fits, so a returning visitor never loses a viewed tile to the limit');
 assert.ok(LIMITS.chunks>=1259,'every building chunk (1,259) fits, so "Save the whole map" keeps all of them');
});
