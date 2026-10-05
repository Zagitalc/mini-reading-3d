import test from 'node:test';
import assert from 'node:assert/strict';
import {SEARCH_GROUPS,groupOrder,matchScore,normalise,rank} from '../shared/search';
import {MODE_IDS} from '../shared/modes';

test('each mode puts its own results first and still lists every group once',()=>{
 for(const id of MODE_IDS)assert.deepEqual([...groupOrder(id)].sort(),[...SEARCH_GROUPS].sort(),id);
 assert.deepEqual(groupOrder('transport').slice(0,2),['route','stop']);
 assert.equal(groupOrder('drive')[0],'fuel');assert.equal(groupOrder('environment')[0],'river');
 assert.equal(groupOrder('eat')[0],'food');assert.equal(groupOrder('explore')[0],'landmark');
});

test('text is compared without case, accents or curly quotes',()=>{
 assert.equal(normalise('St Mary’s Butts'),'st marys butts');assert.equal(normalise("St Mary's"),'st marys');
 assert.equal(normalise('  Café  Nero '),'cafe nero');assert.equal(normalise('Earley–Wokingham'),'earley wokingham');
});

test('a whole match beats a prefix, a word start and a match inside a word',()=>{
 assert.equal(matchScore('17',['17']),0);assert.equal(matchScore('17',['17a']),1);
 assert.equal(matchScore('oxford',['West Oxford Road']),2);assert.equal(matchScore('ford',['Oxford Road']),3);
 assert.equal(matchScore('zzz',['Oxford Road']),-1);assert.equal(matchScore('',['Oxford Road']),-1);
 assert.equal(matchScore('RG1',['Some Café','RG1 7LB']),1,'any field counts');
});

test('several words must each appear, in any order or field',()=>{
 assert.equal(matchScore('tesco oxford',['Tesco Express','Oxford Road']),2);
 assert.equal(matchScore('road oxford',['Oxford Road']),2);
 assert.equal(matchScore('tesco caversham',['Tesco Express','Oxford Road']),-1);
});

test('ranking orders by score, then shorter names, and stops at the limit',()=>{
 const routes=['17','117','17a','X17'].map(label=>({label}));
 assert.deepEqual(rank(routes,'17',r=>[r.label],r=>r.label,10).map(r=>r.item.label),['17','17a','117','X17']);
 assert.equal(rank(routes,'17',r=>[r.label],r=>r.label,2).length,2);
});
