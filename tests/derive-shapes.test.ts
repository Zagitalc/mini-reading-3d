import test from 'node:test';import assert from 'node:assert/strict';
import{fromLocal,nearestOnLine}from'../shared/geo';
import{deriveShapes}from'../scripts/derive-shapes';
import type{LngLat}from'../shared/types';
const p=(x:number,y:number):LngLat=>fromLocal([x,y]);
const stop=(id:string,[lon,lat]:LngLat)=>({stop_id:id,stop_lon:String(lon),stop_lat:String(lat)});
const calls=(trip:string,ids:string[])=>ids.map((stop_id,i)=>({trip_id:trip,stop_id,stop_sequence:String(i)}));

test('a pattern reuses the road geometry of an earlier shape that serves its stops in order',()=>{
 // An L-shaped road: a straight line between the end stops would cut the corner by ~140 m.
 const road=[p(0,0),p(200,0),p(200,200)];
 const stops=[stop('A',p(0,5)),stop('B',p(195,10)),stop('C',p(205,200))];
 const out=deriveShapes([{trip_id:'T',route_id:'R'}],[{route_id:'R',route_short_name:'17'}],calls('T',['A','B','C']),stops,[{routeLabel:'17',line:road}]);
 assert.equal(out.reused,1);assert.equal(out.straight,0);
 const shape=out.shapes[out.tripShapes.get('T')!];
 assert.ok(nearestOnLine(p(200,0),shape).distance<1,'keeps the corner');
});

test('out-and-back roads match stops on the correct pass, and unmatched patterns fall back visibly',()=>{
 // Out along y=0, back along y=20: a return stop at x=100 must not match the outward pass.
 const road=[p(0,0),p(300,0),p(300,20),p(0,20)];
 const stops=[stop('A',p(10,0)),stop('B',p(290,5)),stop('C',p(100,20)),stop('Far',p(900,900))];
 const trips=[{trip_id:'T1',route_id:'R'},{trip_id:'T2',route_id:'R'},{trip_id:'T3',route_id:'R'}];
 const out=deriveShapes(trips,[{route_id:'R',route_short_name:'21'}],[...calls('T1',['A','B','C']),...calls('T2',['A','B','C']),...calls('T3',['A','Far'])],stops,[{routeLabel:'21',line:road}]);
 assert.equal(out.tripShapes.get('T1'),out.tripShapes.get('T2'),'identical patterns share a shape');
 const shape=out.shapes[out.tripShapes.get('T1')!];
 assert.ok(nearestOnLine(p(300,10),shape).distance<1,'includes the turn at the far end');
 assert.equal(out.reused,1);assert.equal(out.straight,1);
 assert.equal(out.shapes[out.tripShapes.get('T3')!].length,2);
});
