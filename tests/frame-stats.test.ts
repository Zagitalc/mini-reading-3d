import test from 'node:test';import assert from 'node:assert/strict';
import {summariseFrames,verdict} from '../shared/frame-stats';
test('a steady 60 Hz run is smooth',()=>{const s=summariseFrames(Array(120).fill(16.7))!;assert.equal(s.frames,120);assert.equal(s.medianMs,16.7);assert.equal(s.slowShare,0);assert.equal(Math.round(s.fps),60);assert.equal(verdict(s),'smooth');});
test('the 95th percentile, not the average, decides the verdict',()=>{const gaps=[...Array(90).fill(16.7),...Array(10).fill(60)];const s=summariseFrames(gaps)!;assert.equal(s.medianMs,16.7);assert.equal(s.p95Ms,60);assert.equal(s.slowShare,.1);assert.equal(verdict(s),'struggling');});
test('a 30 fps run is acceptable at best',()=>{const s=summariseFrames(Array(100).fill(33.3))!;assert.equal(verdict(s),'acceptable');assert.equal(s.slowShare,1);});
test('too few frames give no result, and bad values are ignored',()=>{assert.equal(summariseFrames([16,16,16]),undefined);assert.equal(summariseFrames([NaN,0,-4,...Array(9).fill(16)]),undefined);});
