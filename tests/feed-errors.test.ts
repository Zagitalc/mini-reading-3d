import test from 'node:test';
import assert from 'node:assert/strict';
import {feedFailureReason} from '../shared/feed-errors';
test('feed errors retain useful status without leaking request URLs or keys',()=>{
 assert.equal(feedFailureReason(new Error('Bus provider returned HTTP 403')),'Bus provider returned HTTP 403');
 assert.equal(feedFailureReason(new DOMException('secret URL','TimeoutError')),'Provider request timed out');
 for(const e of [new Error('https://example.org?api_key=secret'),new TypeError('https://example.org?api_key=secret'),new Error('D1_ERROR: sensitive query')])assert.ok(!feedFailureReason(e).includes('secret'));
});
