import test from 'node:test';
import assert from 'node:assert/strict';
import {LANDMARKS} from '../shared/config';
import {LANDMARK_STORIES,STORIES_CHECKED} from '../shared/landmark-stories';

test('every hand-modelled landmark has a story',()=>{
 for(const l of LANDMARKS)assert.ok(LANDMARK_STORIES[l.id]?.facts.length,`${l.id} has no story`);
 assert.deepEqual(Object.keys(LANDMARK_STORIES).sort(),LANDMARKS.map(l=>l.id).sort());
});

test('every fact cites a listed source and every source is cited',()=>{
 for(const [id,story] of Object.entries(LANDMARK_STORIES)){
  const ids=new Set(story.sources.map(s=>s.id)),used=new Set<string>();
  assert.equal(ids.size,story.sources.length,`${id} repeats a source id`);
  for(const f of story.facts){
   assert.ok(f.sources.length,`${id}: "${f.text}" has no source`);
   for(const s of f.sources){assert.ok(ids.has(s),`${id}: unknown source ${s}`);used.add(s);}
  }
  assert.deepEqual([...used].sort(),[...ids].sort(),`${id} lists a source no fact cites`);
  for(const s of story.sources)assert.match(s.url,/^https:\/\//,`${id}: ${s.url} is not https`);
 }
});

test('the checked date is a real date',()=>{assert.match(STORIES_CHECKED,/^\d{4}-\d\d-\d\d$/);assert.ok(Number.isFinite(Date.parse(STORIES_CHECKED)));});
