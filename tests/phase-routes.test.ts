import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {clipLine,deduplicate,fallbackColour,routeMatches,uniqueRoutes,type StaticRoute} from '../shared/static-routes';
import {speedLimit,surveyedLimit,STANDARD_LIMITS} from '../shared/speed-limits';
import {replacementLandmark,STATION_BUILDINGS,STATION_PLATFORMS} from '../shared/landmark-components';
import {RailNetwork} from '../server/rail-network';
import {inBounds,nearestOnLine} from '../shared/geo';
import type {LngLat} from '../shared/types';
const dest=process.env.GEOGRAPHY_OUTPUT??'public/data';
test('clipping retains disconnected re-entries without a false joining segment',()=>{
 const result=clipLine([[-1,.5],[.5,.5],[2,.5],[2,2],[.5,2],[.5,.5]],[0,0,1,1]);
 assert.deepEqual(result,[[[0,.5],[.5,.5],[1,.5]],[[.5,1],[.5,.5]]]);
 assert.deepEqual(clipLine([[-2,-2],[-1,-1]],[0,0,1,1]),[]);
});
test('identical and reverse shape variants deduplicate; distinct variants survive',()=>{
 const a:LngLat[]=[[0,0],[1,1]],b:LngLat[]=[[0,0],[.5,.2],[1,1]];
 assert.equal(deduplicate([a,[...a].reverse(),b]).length,2);
 assert.equal(fallbackColour('RBUS:500'),fallbackColour('RBUS:500'));assert.match(fallbackColour('new'),/^#[a-f0-9]{6}$/);
 assert.deepEqual(uniqueRoutes(['17','17','13']),['17','13']);
});
test('all explicit standard speeds and NSL remain distinct',()=>{
 for(const n of STANDARD_LIMITS.filter(n=>n!=='NSL')){assert.equal(speedLimit(`${n} mph`),n);assert.equal(surveyedLimit({traffic_sign:`GB:670[${n}]`}),n);}
 assert.equal(speedLimit('GB:nsl_single'),'NSL');assert.equal(surveyedLimit({traffic_sign:'GB:671'}),'NSL');
 for(const v of ['GB:nsl_restricted','international','signals','40 km/h','45','walk',''])assert.equal(speedLimit(v),undefined);
});
test('static routes are credential-free, bounded, searchable and reproducible',async()=>{
 const buses:StaticRoute[]=JSON.parse(await readFile(`${dest}/bus-routes.json`,'utf8'));
 assert.equal(buses.length,53);assert.equal(new Set(buses.map(r=>r.id)).size,buses.length);
 for(const r of buses){assert.ok(r.coordinates.length);for(const line of r.coordinates)for(const p of line)assert.ok(inBounds(p));assert.equal(deduplicate(r.coordinates).length,r.coordinates.length);assert.ok(r.snapshot&&r.sourceUrl);}
 const r=buses.find(r=>r.label==='17')!;assert.ok(routeMatches(r,'17'));assert.ok(routeMatches(r,'Reading Buses'));assert.ok(routeMatches(r,r.destinations[0]));assert.ok(r.colourSource.includes('purple'));
});
test('rail corridors use connected source edges; no fabricated connectors',async()=>{
 const routes:StaticRoute[]=JSON.parse(await readFile(`${dest}/rail-corridors.json`,'utf8'));
 const geo=JSON.parse(await readFile(`${dest}/railways.json`,'utf8')),graph=new RailNetwork(geo.features);
 const edges=[...graph.nodes.values()].flatMap(n=>n.edges.map(e=>[n.p,graph.nodes.get(e.id)!.p] as LngLat[]));
 assert.equal(routes.length,7);
 for(const r of routes){assert.equal(r.kind,'rail');assert.equal(r.operator,undefined);for(const line of r.coordinates){for(let i=1;i<line.length;i++){
  assert.ok(inBounds(line[i]));assert.ok(edges.some(e=>nearestOnLine(line[i-1],e).distance<.1&&nearestOnLine(line[i],e).distance<.1),`non-source edge in ${r.id}`);
 }}}
});
test('landmark replacements include roofs and all platforms, preserve neighbours',async()=>{
 const data=JSON.parse(await readFile(`${dest}/landmark-components.json`,'utf8'));
 assert.ok(data.snapshot);for(const id of [...STATION_BUILDINGS,...STATION_PLATFORMS])assert.ok(data.components.some((c:any)=>c.id===id),id);
 assert.equal(replacementLandmark('area/77499534'),undefined); // Thames Tower
 assert.equal(replacementLandmark('area/41711268'),undefined); // Apex Plaza
 assert.ok(data.components.some((c:any)=>c.kind==='concourse'&&c.base>=8));
 for(const c of data.components){assert.ok(c.rings[0].length>=4);if(c.kind==='canopy')assert.ok(c.base>=5&&c.height<1);}
 const signs=JSON.parse(await readFile(`${dest}/features.json`,'utf8')).signs;
 for(const limit of ['20','30','40','50','70','NSL'])assert.ok(signs.some((s:any)=>s.limit===limit),limit);
});
