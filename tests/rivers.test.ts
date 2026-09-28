import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectGauges,parseGauge,parseFloods,parsePolygon,fitPolygon,fetchRivers,eaTime,EA_BASE} from '../server/providers/rivers';
import {riverSnapshot} from '../shared/feed-policy';
import {feedFailureReason} from '../shared/feed-errors';
import {rangeState,mainLevel} from '../src/map/river-layers';
// Fixtures are Environment Agency responses captured on 28 September 2026 (trimmed to a few items).
const fixture=(name:string)=>JSON.parse(readFileSync(new URL(`./fixtures/rivers/${name}`,import.meta.url),'utf8'));
const now=Date.parse('2026-09-28T17:00:00Z');
const caversham=fixture('station-2201TH.json');
const withMeasures=(measures:unknown[])=>({items:{...caversham.items,measures}});
const reading=(unit:string,qualifier:string,value:number,dateTime='2026-09-28T16:30:00Z')=>({'@id':`x/${qualifier}-${unit}`,parameter:'level',qualifier,unitName:unit,latestReading:{dateTime,value}});
test('selects open Thames and Kennet level gauges inside the map area, including ones without riverName',()=>{
 // Loddon (Twyford) is another river; Whitchurch and Shiplake Locks fall just outside the map bounds.
 assert.deepEqual(selectGauges(fixture('stations-near-reading.json')),['2201TH','2290TH','2298TH']);
 assert.deepEqual(selectGauges({items:[{...fixture('stations-near-reading.json').items[0],status:'http://environment.data.gov.uk/flood-monitoring/def/core/statusClosed'},{nonsense:true}]}),[]);
});
test('a gauge keeps each measured level with its own reading time and the published typical range',()=>{
 const g=parseGauge(caversham,now)!;
 assert.equal(g.id,'ea:2201TH');assert.equal(g.river,'River Thames');assert.deepEqual(g.position,[-0.963635,51.460811]);
 assert.deepEqual(g.levels.map(l=>[l.qualifier,l.unit,l.value,l.readAt]),[['Stage','mASD',0.129,'2026-09-28T16:30:00.000Z'],['Downstream Stage','mASD',1.99,'2026-09-28T16:30:00.000Z']]);
 assert.equal(g.typicalLow,0.068);assert.equal(g.typicalHigh,0.3);assert.deepEqual(g.highestRecent,{value:0.836,at:'2014-01-10T06:00:00.000Z'});
 assert.equal(g.sourceUrl,'https://check-for-flooding.service.gov.uk/station/7111','GOV.UK addresses gauges by RLOI id');
 assert.equal(mainLevel(g)?.qualifier,'Stage');assert.equal(rangeState(g),'normal');
 assert.equal(rangeState({...g,levels:[{...g.levels[0],value:0.31}]}),'high');
 assert.equal(rangeState({...g,typicalHigh:undefined}),'unknown','no invented thresholds');
});
test('one reading per qualifier, preferring the stage datum; unitless and non-stage measures are ignored',()=>{
 const g=parseGauge(withMeasures([reading('m','Stage',1.1),reading('mAOD','Stage',37.6),reading('mASD','Stage',0.2),reading('---','Stage',9),reading('mAOD','Height',40),reading('m','Downstream Stage',0.5)]),now)!;
 assert.deepEqual(g.levels.map(l=>[l.qualifier,l.unit,l.value]),[['Stage','mASD',0.2],['Downstream Stage','m',0.5]]);
 assert.equal(rangeState({...g,levels:[g.levels[1]]}),'unknown','range applies only to local-datum stage');
});
test('station without riverName takes the river from its label and a readable name',()=>{
 const theale=fixture('stations-near-reading.json').items[1];
 const g=parseGauge({items:{...theale,measures:[reading('mASD','Stage',0.4)]}},now)!;
 assert.equal(g.river,'River Kennet');assert.equal(g.label,'River Kennet at Theale');assert.match(g.sourceUrl!,/\/id\/stations\/2290TH$/);
});
test('future-dated, missing or other-river readings never become a gauge',()=>{
 assert.equal(parseGauge(withMeasures([reading('mASD','Stage',1.2,'2026-09-28T18:00:00Z')]),now),undefined);
 assert.equal(parseGauge(withMeasures([{...reading('mASD','Stage',1),latestReading:undefined}]),now),undefined);
 assert.equal(parseGauge({items:{...caversham.items,riverName:'River Pang'}},now),undefined);
});
test('zone-less EA times are read as UTC on any machine',()=>{
 assert.equal(eaTime('2026-09-28T14:43:00'),Date.parse('2026-09-28T14:43:00Z'));
 assert.equal(eaTime('2026-09-28T16:30:00Z'),Date.parse('2026-09-28T16:30:00Z'));
 assert.ok(Number.isNaN(eaTime(undefined)));
});
test('flood items keep severity, official times and message lines; "no longer in force" is dropped',()=>{
 const out=parseFloods(fixture('floods-national.json'),now);
 assert.equal(out.length,1);const w=out[0];
 assert.equal(w.areaId,'113WACT1B');assert.equal(w.severity,'Flood alert');assert.equal(w.severityLevel,3);
 assert.equal(w.raisedAt,'2026-09-28T14:43:48.000Z');assert.equal(w.changedAt,'2026-09-28T14:43:00.000Z');
 assert.ok(w.message!.startsWith('High tides over the next two days may lead to flooding.\nFlooding is possible'));assert.ok(!/ \n/.test(w.message!));
 assert.equal(w.polygonUrl,`${EA_BASE}/id/floodAreas/113WACT1B/polygon`,'fetched over HTTPS, avoiding the 301');
 assert.equal(w.sourceUrl,'https://check-for-flooding.service.gov.uk/target-area/113WACT1B');
});
const ring=(x:number,n:number,step=0.0002)=>[[x,51.46],...Array.from({length:n},(_,i)=>[x+i*step,51.46+(i%2)*1e-6]),[x+0.01,51.47],[x,51.46]];
test('warning outlines are reduced but keep their shape',()=>{
 const area=parsePolygon({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[ring(-0.97,50)]}},{type:'Feature',geometry:{type:'MultiPolygon',coordinates:[[ring(-0.95,50)]]}}]})!;
 assert.equal(area.type,'MultiPolygon');assert.equal(area.coordinates.length,2);assert.ok(area.coordinates[0][0].length<10,'collinear points dropped');
 assert.deepEqual(area.coordinates[0][0][0],area.coordinates[0][0].at(-1),'ring stays closed');
 assert.equal(parsePolygon({type:'FeatureCollection',features:[]}),null);
});
test('an outline too big for storage is simplified harder, then left undrawn rather than breaking the feed',()=>{
 // A zig-zag whose detail survives fine simplification but not coarse.
 const zig=[...Array.from({length:4000},(_,i)=>[-1+i*0.0001,51.4+(i%2)*0.0004]),[-0.6,51.5],[-1,51.4]];
 const input={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[zig]}}]};
 const loose=fitPolygon(input,20_000);assert.equal(loose.tooLarge,false);assert.ok(JSON.stringify(loose.area).length<=20_000);
 assert.deepEqual(fitPolygon(input,50),{area:null,tooLarge:true});
});
test('snapshot keeps gauges for six hours but warnings only while the last refresh is under an hour old',()=>{
 const items=[{kind:'gauge' as const},{kind:'warning' as const}],at=(h:number)=>new Date(now-h*3_600_000).toISOString();
 assert.deepEqual(riverSnapshot(items,at(.5),now),{data:items,warningsCurrent:true});
 assert.deepEqual(riverSnapshot(items,at(2),now),{data:[items[0]],warningsCurrent:false});
 assert.deepEqual(riverSnapshot(items,at(7),now),{data:[],warningsCurrent:false});
 assert.deepEqual(riverSnapshot(items,undefined,now),{data:[],warningsCurrent:false});
 assert.equal(feedFailureReason(Error('River provider returned HTTP 503')),'River provider returned HTTP 503');
});
test('refresh fetches each outline once and survives a failing gauge',async()=>{
 const original=globalThis.fetch;const calls:string[]=[];const fresh=new Date(Date.now()-600_000).toISOString();
 globalThis.fetch=(async(input:string|URL)=>{const url=String(input);calls.push(url.replace(EA_BASE,''));
  if(url.includes('/id/stations?'))return Response.json(fixture('stations-near-reading.json'));
  if(url.endsWith('/id/stations/2201TH'))return Response.json(withMeasures([reading('mASD','Stage',0.1,fresh)]));
  if(url.endsWith('/id/stations/2290TH'))return new Response('',{status:500});
  if(url.endsWith('/id/stations/2298TH'))return Response.json({items:{...fixture('stations-near-reading.json').items[5],measures:[reading('mASD','Stage',0.07,fresh)]}});
  if(url.includes('/id/floods?'))return Response.json({items:[{floodAreaID:'061FWF23ReadCav',severityLevel:2,description:'River Thames at Caversham',floodArea:{polygon:'http://environment.data.gov.uk/flood-monitoring/id/floodAreas/061FWF23ReadCav/polygon'}}]});
  if(url.endsWith('/floodAreas/061FWF23ReadCav/polygon'))return Response.json({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[ring(-0.97,5)]}}]});
  throw Error('unexpected '+url);}) as typeof fetch;
 try{
  const first=await fetchRivers();assert.deepEqual(first.map(i=>i.id),['ea:2201TH','ea:2298TH','flood:061FWF23ReadCav']);assert.ok(first[2].kind==='warning'&&first[2].area);
  calls.length=0;await fetchRivers(first);assert.ok(!calls.some(c=>c.includes('polygon')),'outline reused from the previous snapshot');
  assert.equal(calls.length,5,'list + three gauges + floods');
 }finally{globalThis.fetch=original;}
});
