import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_MODE,MODES,MODE_IDS,MODE_LAYERS,initialMode,parseMode,wantsVehicles} from '../shared/modes';

test('every mode sets every layer it manages, and Everything turns all of them on',()=>{
 for(const id of MODE_IDS)assert.deepEqual(Object.keys(MODES[id].layers).sort(),[...MODE_LAYERS].sort(),id);
 assert.ok(MODE_LAYERS.every(l=>MODES.lab.layers[l]));
});

test('traffic tiles and vehicle positions stay off outside the modes that need them',()=>{
 for(const id of MODE_IDS)assert.equal(MODES[id].layers.traffic,id==='drive'||id==='lab',id);
 for(const id of MODE_IDS)assert.equal(wantsVehicles(MODES[id].layers,false),id==='transport'||id==='lab',id);
 assert.equal(wantsVehicles(MODES.explore.layers,true),true,'an open stop board still gets live positions');
});

test('Transport is the default, so bus history keeps recording on ordinary visits',()=>{
 assert.equal(DEFAULT_MODE,'transport');
 assert.equal(initialMode('',null),'transport');
});

test('the address wins over the remembered mode, and bad values fall through',()=>{
 assert.equal(initialMode('?mode=drive','explore'),'drive');
 assert.equal(initialMode('?mode=DRIVE',null),'drive');
 assert.equal(initialMode('?mode=everything',null),'lab');
 assert.equal(initialMode('?mode=shopping','environment'),'environment');
 assert.equal(initialMode('?city=reading','nonsense'),'transport');
 assert.equal(parseMode(''),undefined);
});
