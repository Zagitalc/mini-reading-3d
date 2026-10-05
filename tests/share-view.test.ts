import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCamera,parseSelection,sameLabel,viewSearch} from '../shared/share-view';

test('a camera in the address opens that view, and one outside the map is ignored',()=>{
 assert.deepEqual(parseCamera('?lat=51.4584&lng=-0.9717&zoom=14.8&pitch=55&bearing=-24'),{center:[-0.9717,51.4584],zoom:14.8,pitch:55,bearing:-24});
 assert.deepEqual(parseCamera('?lat=51.4584&lng=-0.9717&zoom=14'),{center:[-0.9717,51.4584],zoom:14,pitch:0,bearing:0},'pitch and bearing are optional');
 assert.equal(parseCamera('?lat=51.5074&lng=-0.1278&zoom=14'),undefined,'London is outside the map');
 assert.equal(parseCamera('?lat=51.4584&lng=-0.9717&zoom=8'),undefined,'zoom below the map minimum');
 assert.equal(parseCamera('?lat=51.4584&lng=-0.9717&zoom=14&pitch=80'),undefined,'pitch beyond the map maximum');
 assert.equal(parseCamera('?lat=51.4584&lng=-0.9717'),undefined,'no zoom');
 assert.equal(parseCamera('?lat=&lng=-0.9717&zoom=14'),undefined,'empty value is not zero');
 assert.equal(parseCamera('?mode=transport'),undefined);
});

test('the first selection in the address wins, in a fixed order',()=>{
 assert.deepEqual(parseSelection('?mode=transport&route=17'),{kind:'route',id:'17'});
 assert.deepEqual(parseSelection('?stop=039026150001&route=17'),{kind:'route',id:'17'});
 assert.deepEqual(parseSelection('?food=%20202764%20'),{kind:'food',id:'202764'});
 assert.deepEqual(parseSelection('?landmark=oracle'),{kind:'landmark',id:'oracle'});
 assert.equal(parseSelection('?route='),undefined);
 assert.equal(parseSelection(`?stop=${'x'.repeat(81)}`),undefined);
});

test('writing the view keeps other parameters and replaces the old view',()=>{
 const camera={center:[-0.971234567,51.458412345] as [number,number],zoom:14.81234,pitch:55.4,bearing:-24.3};
 const out=new URLSearchParams(viewSearch('?city=reading&mode=drive&stop=old&lat=1',{mode:'transport',camera,selection:{kind:'route',id:'19a'}}));
 assert.equal(out.get('city'),'reading');assert.equal(out.get('mode'),'transport');
 assert.equal(out.get('lat'),'51.45841');assert.equal(out.get('lng'),'-0.97123');assert.equal(out.get('zoom'),'14.81');
 assert.equal(out.get('pitch'),'55');assert.equal(out.get('bearing'),'-24');
 assert.equal(out.get('route'),'19a');assert.equal(out.get('stop'),null,'only one selection at a time');
 const bare=new URLSearchParams(viewSearch('?mode=drive&lat=51.4&lng=-1&zoom=12&food=1',{mode:'eat'}));
 assert.deepEqual([...bare.keys()],['mode'],'no camera or selection leaves only the mode');
});

test('a written view reads back as the same view',()=>{
 const camera={center:[-0.95,51.44] as [number,number],zoom:16.5,pitch:60,bearing:170};
 const search=viewSearch('',{mode:'explore',camera,selection:{kind:'stop',id:'039026150001'}});
 assert.deepEqual(parseCamera(search),camera);assert.deepEqual(parseSelection(search),{kind:'stop',id:'039026150001'});
});

test('route labels match whatever case the link uses',()=>{
 assert.ok(sameLabel('19a','19A'));assert.ok(sameLabel(' 17','17'));assert.ok(!sameLabel('17','17a'));
});
