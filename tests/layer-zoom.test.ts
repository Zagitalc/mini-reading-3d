import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {LABEL_AFTER_POINT,LAYER_ZOOM,RENDER_BUDGET} from '../shared/layer-zoom';
import {BOUNDS,INITIAL_VIEW} from '../shared/config';

test('every zoom rule lies inside the range the map allows',()=>{
 for(const [name,z] of Object.entries(LAYER_ZOOM))assert.ok(z>=11&&z<=19,`${name} ${z}`);
 assert.ok(INITIAL_VIEW.zoom>=11&&INITIAL_VIEW.zoom<=19);
 assert.equal(BOUNDS.length,4);
});

test('a label never appears at a lower zoom than the thing it labels',()=>{
 for(const [label,point] of LABEL_AFTER_POINT)assert.ok(LAYER_ZOOM[label]>=LAYER_ZOOM[point],`${label} before ${point}`);
});

test('the render budget is finite and positive',()=>{
 for(const [name,n] of Object.entries(RENDER_BUDGET))assert.ok(Number.isInteger(n)&&n>0,name);
});

test('map layers take their zoom from the table, not from a number written beside the layer',()=>{
 const files:string[]=[];
 const walk=(d:string)=>{for(const f of readdirSync(d)){const p=join(d,f);if(statSync(p).isDirectory())walk(p);else if(p.endsWith('.ts'))files.push(p);}};
 walk('src');
 const literal=/\{id:[^{}]*?\b(?:minzoom|maxzoom):\d/;
 // Tile sources state what zoom levels the data exists at; that is a fact about the data, not a display rule.
 const allowed=(line:string)=>/sources:\{|addSource\(/.test(line)||/minzoom:0,/.test(line);
 const bad=files.flatMap(f=>readFileSync(f,'utf8').split('\n').map((l,i)=>[f,i+1,l] as const)).filter(([,,l])=>literal.test(l)&&!allowed(l)).map(([f,i])=>`${f}:${i}`);
 assert.deepEqual(bad,[],'move these zoom numbers into shared/layer-zoom.ts');
});
