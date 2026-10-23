import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cachePosition} from './cache-position.mjs';
test('prefill at zero, next single token follows prefill without a hole',()=>{
  assert.equal(cachePosition(0,'contiguous'),0);
  assert.equal(cachePosition(4,'contiguous'),3);
  assert.equal(cachePosition(5,'contiguous'),4);
  assert.equal(cachePosition(4,'upstream'),4);
  assert.throws(()=>cachePosition(4,'unknown'));
});
