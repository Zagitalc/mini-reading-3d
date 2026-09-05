import{test}from'node:test';import assert from'node:assert/strict';import{validateStyleMin}from'@maplibre/maplibre-gl-style-spec';import{mapStyle}from'../src/map/style';
test('map style validates, including zoom-dependent road casing',()=>{Object.defineProperty(globalThis,'location',{value:{origin:'http://localhost:5174'},configurable:true});assert.deepEqual(validateStyleMin(mapStyle()),[]);});
